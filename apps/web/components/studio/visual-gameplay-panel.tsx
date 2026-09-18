"use client";

import { useMemo, useState } from "react";
import type { EngineProjectV2Type } from "@indieforge/contracts";
import { createStudioId, useStudio } from "./studio-provider";
import { prepareStudioCommit } from "./studio-history";
import { studioValidationMessage } from "./component-editor";
import type { StudioMutation } from "./studio-state";
import { useStudioSelection } from "./studio-selection";

type Event = EngineProjectV2Type["events"][number];
type Scene = EngineProjectV2Type["scenes"][number];
type GameObject = Scene["objects"][number];
type EventStep = Event["steps"][number];
type VariableType = "BOOLEAN" | "NUMBER" | "STRING";
type TriggerKind = "START" | "TIMER" | "KEY" | "COLLISION" | "COLLECT" | "ENTER";
type ActionKind = "SCORE" | "WIN" | "DAMAGE" | "DESTROY" | "PLAY_AUDIO";

function useGameplayCommit() {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const editable = state.ready && !state.recoveryError && !state.resolution && !state.batchError;
  function commit(mutations: StudioMutation[]) {
    if (!editable) return false;
    try {
      prepareStudioCommit(state, mutations);
      dispatch({ type: "commit", mutations });
      setError("");
      return true;
    } catch (failure) {
      setError(studioValidationMessage(failure));
      return false;
    }
  }
  return { state, editable, commit, error };
}

function describeTrigger(event: Event) {
  if (event.trigger.type === "ON_START") return "Khi màn chơi bắt đầu";
  if (event.trigger.type === "ON_TIMER") return `Sau ${event.trigger.delayMs / 1000} giây`;
  if (event.trigger.type === "ON_KEY_PRESS") return `Khi nhấn phím ${event.trigger.key}`;
  if (event.trigger.type === "ON_COLLECT_ITEM") return "Khi nhặt vật phẩm";
  if (event.trigger.type === "ON_COLLISION") return "Khi hai đối tượng chạm nhau";
  if (event.trigger.type === "ON_ENTER_AREA") return "Khi đi vào vùng";
  return event.trigger.type;
}

function describeSteps(event: Event) {
  return event.steps.map((step) => {
    if (step.type === "ADD_SCORE") return `cộng ${step.amount} điểm`;
    if (step.type === "COMPLETE_GAME") return "hoàn thành trò chơi";
    if (step.type === "CHANGE_HEALTH") return `đổi ${step.amount} máu`;
    if (step.type === "PLAY_AUDIO") return "phát âm thanh";
    return step.type;
  }).join(" → ");
}

function hasComponent(object: GameObject, type: string) {
  return object.components.some((component) => component.type === type);
}

function hasRuntimeBounds(object: GameObject) {
  return hasComponent(object, "Collider") || hasComponent(object, "Trigger");
}

function isRuntimePlayer(object: GameObject) {
  const movement = object.components.find(
    (component) => component.type === "Movement",
  );
  return (
    object.objectType === "PLAYER" &&
    hasRuntimeBounds(object) &&
    (movement?.properties as { controls?: unknown } | undefined)?.controls ===
      "PLAYER"
  );
}

function isRuntimeCollectible(object: GameObject) {
  const item = object.components.find(
    (component) => component.type === "InventoryItem",
  );
  return (
    object.objectType === "ITEM" &&
    hasRuntimeBounds(object) &&
    (item?.properties as { collectible?: unknown } | undefined)
      ?.collectible === true
  );
}

function isRuntimeArea(object: GameObject) {
  return object.objectType === "TRIGGER" && hasRuntimeBounds(object);
}

function triggerKind(event: Event): TriggerKind | null {
  if (event.trigger.type === "ON_START") return "START";
  if (event.trigger.type === "ON_TIMER") return "TIMER";
  if (event.trigger.type === "ON_KEY_PRESS") return "KEY";
  if (event.trigger.type === "ON_COLLISION") return "COLLISION";
  if (event.trigger.type === "ON_COLLECT_ITEM") return "COLLECT";
  if (event.trigger.type === "ON_ENTER_AREA") return "ENTER";
  return null;
}

function supportedCondition(condition: Event["condition"]) {
  return (
    !condition ||
    (condition.type === "SCORE_COMPARE" &&
      condition.operator === "GREATER_THAN_OR_EQUAL")
  );
}

function stepKind(step: EventStep): ActionKind | null {
  if (step.type === "ADD_SCORE") return "SCORE";
  if (step.type === "COMPLETE_GAME") return "WIN";
  if (step.type === "CHANGE_HEALTH") return "DAMAGE";
  if (step.type === "DESTROY_OBJECT") return "DESTROY";
  if (step.type === "PLAY_AUDIO") return "PLAY_AUDIO";
  return null;
}

function isSupportedRule(event: Event) {
  return !!triggerKind(event) && supportedCondition(event.condition) && event.steps.every((step) => !!stepKind(step));
}

function optionObjects(objects: GameObject[], trigger: TriggerKind, slot: "first" | "second") {
  if (trigger === "COLLECT")
    return objects.filter((object) => slot === "first" ? isRuntimeCollectible(object) : isRuntimePlayer(object));
  if (trigger === "ENTER")
    return objects.filter((object) => slot === "first" ? isRuntimeArea(object) : isRuntimePlayer(object));
  if (trigger === "COLLISION")
    return objects.filter((object) => hasComponent(object, "Collider"));
  return [];
}

function usesObjectTargets(trigger: TriggerKind) {
  return trigger === "COLLECT" || trigger === "ENTER" || trigger === "COLLISION";
}

export function VisualGameplayPanel() {
  const { state, editable, commit, error } = useGameplayCommit();
  const { selection } = useStudioSelection();
  const scene =
    state.document.scenes.find((scene) => scene.id === selection.sceneId) ??
    state.document.scenes.find((scene) => scene.id === state.document.entrySceneId) ??
    state.document.scenes[0];
  const [name, setName] = useState("Luật mới");
  const [trigger, setTrigger] = useState<TriggerKind>("START");
  const [action, setAction] = useState<ActionKind>("SCORE");
  const [steps, setSteps] = useState<EventStep[]>([{ id: createStudioId(), version: 1, type: "ADD_SCORE", amount: 10 }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validation, setValidation] = useState("");
  const [requiresExplicitTargets, setRequiresExplicitTargets] = useState(false);
  const [targetSceneId, setTargetSceneId] = useState(scene.id);
  const [amount, setAmount] = useState(10);
  const [delay, setDelay] = useState(2);
  const [key, setKey] = useState("Space");
  const [needsScore, setNeedsScore] = useState(false);
  const [goalScore, setGoalScore] = useState(1);
  const [actionToAdd, setActionToAdd] = useState<ActionKind>("PLAY_AUDIO");
  const [variableName, setVariableName] = useState("scoreMultiplier");
  const [variableType, setVariableType] = useState<VariableType>("NUMBER");
  const objects = scene.objects;
  const [firstObjectId, setFirstObjectId] = useState("");
  const [secondObjectId, setSecondObjectId] = useState("");
  const firstOptions = useMemo(() => optionObjects(objects, trigger, "first"), [objects, trigger]);
  const secondOptions = useMemo(() => optionObjects(objects, trigger, "second"), [objects, trigger]);
  const targetSceneCurrent = targetSceneId === scene.id;
  const mustPickTargets = usesObjectTargets(trigger) && (requiresExplicitTargets || !targetSceneCurrent);
  const selectedFirstId = targetSceneCurrent && firstOptions.some((object) => object.id === firstObjectId) ? firstObjectId : "";
  const firstId = selectedFirstId || (mustPickTargets ? "" : firstOptions[0]?.id || "");
  const selectedSecondId = targetSceneCurrent && secondOptions.some((object) => object.id === secondObjectId) ? secondObjectId : "";
  const secondId = selectedSecondId || (mustPickTargets ? "" : secondOptions.find((object) => object.id !== firstId)?.id || secondOptions[0]?.id || "");
  const firstSelectValue = mustPickTargets ? selectedFirstId : firstId;
  const secondSelectValue = mustPickTargets ? selectedSecondId : secondId;
  const healthTargets = objects.flatMap((object) => object.components.filter((component) => component.type === "Health").map((component) => ({ object, component })));
  const [healthComponentId, setHealthComponentId] = useState("");
  const healthTarget = healthTargets.find(({ component }) => component.id === healthComponentId) ?? healthTargets[0];
  const audioStep = steps.find((step) => step.type === "PLAY_AUDIO");
  const scoreStep = steps.find((step) => step.type === "ADD_SCORE");

  function resetForm() {
    setEditingId(null);
    setName("Luật mới");
    setTrigger("START");
    setAction("SCORE");
    setSteps([{ id: createStudioId(), version: 1, type: "ADD_SCORE", amount: 10 }]);
    setAmount(10);
    setDelay(2);
    setKey("Space");
    setNeedsScore(false);
    setGoalScore(1);
    setFirstObjectId("");
    setSecondObjectId("");
    setRequiresExplicitTargets(false);
    setTargetSceneId(scene.id);
    setHealthComponentId("");
    setValidation("");
  }

  function loadRule(event: Event) {
    if (!isSupportedRule(event)) return;
    const kind = triggerKind(event)!;
    setEditingId(event.id);
    setName(event.name);
    setTrigger(kind);
    setSteps(structuredClone(event.steps));
    const main = event.steps.find((step) => step.type !== "PLAY_AUDIO");
    setAction(main ? stepKind(main)! : "PLAY_AUDIO");
    const score = event.steps.find((step) => step.type === "ADD_SCORE");
    setAmount(score?.amount ?? 10);
    setDelay(event.trigger.type === "ON_TIMER" ? event.trigger.delayMs / 1000 : 2);
    setKey(event.trigger.type === "ON_KEY_PRESS" ? event.trigger.key : "Space");
    setFirstObjectId(
      event.trigger.type === "ON_COLLECT_ITEM" ? event.trigger.itemObjectId :
      event.trigger.type === "ON_ENTER_AREA" ? event.trigger.areaObjectId :
      event.trigger.type === "ON_COLLISION" ? event.trigger.firstObjectId : "",
    );
    setSecondObjectId(
      event.trigger.type === "ON_COLLECT_ITEM" ? event.trigger.collectorObjectId ?? "" :
      event.trigger.type === "ON_ENTER_AREA" ? event.trigger.enteringObjectId ?? "" :
      event.trigger.type === "ON_COLLISION" ? event.trigger.secondObjectId : "",
    );
    setRequiresExplicitTargets(false);
    setTargetSceneId(scene.id);
    const damage = event.steps.find((step) => step.type === "CHANGE_HEALTH");
    setHealthComponentId(damage?.componentId ?? "");
    setNeedsScore(event.condition?.type === "SCORE_COMPARE");
    setGoalScore(event.condition?.type === "SCORE_COMPARE" ? event.condition.value : 1);
    setValidation("");
  }

  function setMainAction(next: ActionKind) {
    setAction(next);
    setSteps((current) => {
      const audio = current.filter((step) => step.type === "PLAY_AUDIO");
      const score = current.find((step) => step.type === "ADD_SCORE");
      if (next === "SCORE") return score ? [{ ...score, amount }, ...audio] : [{ id: createStudioId(), version: 1, type: "ADD_SCORE", amount }, ...audio];
      if (next === "WIN") return [...(score ? [{ ...score, amount }] : []), ...audio, { id: createStudioId(), version: 1, type: "COMPLETE_GAME" }];
      if (next === "DAMAGE" && healthTarget) return [...audio, { id: createStudioId(), version: 1, type: "CHANGE_HEALTH", objectId: healthTarget.object.id, componentId: healthTarget.component.id, amount: -Math.abs(amount) }];
      if (next === "DESTROY") return [...audio, { id: createStudioId(), version: 1, type: "DESTROY_OBJECT", objectId: firstId }];
      return current;
    });
  }

  function addAction() {
    if (actionToAdd === "PLAY_AUDIO") {
      const assetId = state.document.assetIds[0];
      if (!assetId) {
        setValidation("Chưa có âm thanh trong dự án.");
        return;
      }
      setSteps((current) => [...current, { id: createStudioId(), version: 1, type: "PLAY_AUDIO", assetId }]);
      setValidation("");
    }
  }

  function changeTrigger(next: TriggerKind) {
    const hadObjectTargets =
      usesObjectTargets(trigger) && (!!firstObjectId || !!secondObjectId);
    setTrigger(next);
    setFirstObjectId("");
    setSecondObjectId("");
    setRequiresExplicitTargets(hadObjectTargets);
    setTargetSceneId(scene.id);
    setValidation("");
  }

  function selectFirstTarget(value: string) {
    if (!targetSceneCurrent) setRequiresExplicitTargets(true);
    setTargetSceneId(scene.id);
    setFirstObjectId(value);
    setValidation("");
  }

  function selectSecondTarget(value: string) {
    if (!targetSceneCurrent) setRequiresExplicitTargets(true);
    setTargetSceneId(scene.id);
    setSecondObjectId(value);
    setValidation("");
  }

  function validationMessage() {
    if ((trigger === "COLLECT" || trigger === "ENTER" || trigger === "COLLISION") && !firstId)
      return trigger === "COLLECT" ? "Cần chọn vật phẩm trong cảnh hiện tại." : trigger === "ENTER" ? "Cần chọn vùng trong cảnh hiện tại." : "Cần chọn đối tượng va chạm trong cảnh hiện tại.";
    if (trigger === "COLLECT" && !secondId) return "Cần chọn người nhặt trong cảnh hiện tại.";
    if (trigger === "ENTER" && !secondId) return "Cần chọn đối tượng đi vào trong cảnh hiện tại.";
    if (trigger === "COLLISION" && !secondId) return "Cần chọn đối tượng va chạm thứ hai trong cảnh hiện tại.";
    if ((action === "DAMAGE" || steps.some((step) => step.type === "CHANGE_HEALTH")) && !healthTarget)
      return "Cần một đối tượng có Máu trong cảnh hiện tại.";
    if (steps.some((step) => step.type === "PLAY_AUDIO" && !state.document.assetIds.includes(step.assetId)))
      return "Âm thanh đã chọn không còn thuộc dự án.";
    return "";
  }

  function createRule() {
    const message = validationMessage();
    if (message) {
      setValidation(message);
      return;
    }
    const original = editingId ? state.document.events.find((event) => event.id === editingId) : null;
    const eventSteps = steps.map((step) => {
      if (step.type === "CHANGE_HEALTH" && healthTarget)
        return { ...step, objectId: healthTarget.object.id, componentId: healthTarget.component.id, amount: -Math.abs(amount) };
      if (step.type === "DESTROY_OBJECT") return { ...step, objectId: firstId };
      if (step.type === "ADD_SCORE") return { ...step, amount };
      return step;
    });
    const condition: Event["condition"] = needsScore
      ? { id: original?.condition?.type === "SCORE_COMPARE" ? original.condition.id : createStudioId(), version: 1, type: "SCORE_COMPARE", operator: "GREATER_THAN_OR_EQUAL", value: goalScore }
      : null;
    const event: Event = {
      id: editingId ?? createStudioId(), version: 1, name: name.trim() || "Luật mới", enabled: original?.enabled ?? true,
      order: original?.order ?? state.document.events.length,
      trigger: trigger === "COLLISION"
        ? { type: "ON_COLLISION", firstObjectId: firstId, secondObjectId: secondId }
        : trigger === "COLLECT"
          ? { type: "ON_COLLECT_ITEM", itemObjectId: firstId, collectorObjectId: secondId || null }
          : trigger === "ENTER"
            ? { type: "ON_ENTER_AREA", areaObjectId: firstId, enteringObjectId: secondId || null }
            : trigger === "TIMER"
        ? { type: "ON_TIMER", delayMs: Math.max(0, delay * 1000), repeat: false, intervalMs: Math.max(1, delay * 1000) }
        : trigger === "KEY" ? { type: "ON_KEY_PRESS", key: key.trim() || "Space", repeat: false } : { type: "ON_START" },
      condition,
      steps: eventSteps.length ? eventSteps : [{ id: createStudioId(), version: 1, type: "ADD_SCORE", amount }],
    };
    if (commit([{ type: "event.upsert", event }])) resetForm();
  }

  function addVariable() {
    const trimmed = variableName.trim();
    if (!trimmed) return;
    const initialValue = variableType === "BOOLEAN" ? false : variableType === "STRING" ? "" : 0;
    commit([{ type: "project.variables", variables: {
      ...state.document.variables,
      global: [...state.document.variables.global, { id: createStudioId(), name: trimmed, type: variableType, initialValue }],
    } }]);
  }

  return <section className="studio-task-panel studio-gameplay" aria-label="Gameplay trực quan">
    <p className="studio-eyebrow">BƯỚC 4 · GAMEPLAY</p>
    <h2>Luật chơi trực quan</h2>
    <p>Ghép một sự kiện “Khi…” với hành động “Thì…”. Luật được lưu vào dự án và chạy bằng cùng runtime với bản xuất bản.</p>
    <div className="studio-gameplay-grid">
      <form onSubmit={(formEvent) => { formEvent.preventDefault(); createRule(); }}>
        <h3>{editingId ? "Chỉnh luật" : "Tạo luật"}</h3>
        <label>Tên luật<input aria-label="Tên luật" value={name} onChange={(input) => setName(input.target.value)} /></label>
        <label>Khi<select aria-label="Loại sự kiện" value={trigger} onChange={(input) => changeTrigger(input.target.value as typeof trigger)}><option value="START">Màn chơi bắt đầu</option><option value="COLLISION">Hai đối tượng chạm nhau</option><option value="COLLECT">Nhặt vật phẩm</option><option value="ENTER">Đi vào vùng</option><option value="TIMER">Hết thời gian chờ</option><option value="KEY">Người chơi nhấn phím</option></select></label>
        {(["COLLISION", "COLLECT", "ENTER"] as const).includes(trigger as "COLLISION" | "COLLECT" | "ENTER") && <><label>{trigger === "COLLECT" ? "Vật phẩm" : trigger === "ENTER" ? "Vùng" : "Đối tượng thứ nhất"}<select aria-label={trigger === "COLLECT" ? "Vật phẩm" : trigger === "ENTER" ? "Vùng" : "Đối tượng thứ nhất"} value={firstSelectValue} onChange={(input) => selectFirstTarget(input.target.value)}>{mustPickTargets && <option value="">Chọn đối tượng</option>}{firstOptions.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label><label>{trigger === "COLLECT" ? "Người nhặt" : trigger === "ENTER" ? "Đối tượng đi vào" : "Đối tượng thứ hai"}<select aria-label={trigger === "COLLECT" ? "Người nhặt" : trigger === "ENTER" ? "Đối tượng đi vào" : "Đối tượng thứ hai"} value={secondSelectValue} onChange={(input) => selectSecondTarget(input.target.value)}>{mustPickTargets && <option value="">Chọn đối tượng</option>}{secondOptions.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label></>}
        {trigger === "TIMER" && <label>Số giây<input type="number" min="0" value={delay} onChange={(input) => setDelay(Number(input.target.value))} /></label>}
        {trigger === "KEY" && <label>Phím<input value={key} onChange={(input) => setKey(input.target.value)} /></label>}
        <label>Thì<select aria-label="Loại hành động" value={action} onChange={(input) => setMainAction(input.target.value as ActionKind)}><option value="SCORE">Cộng điểm</option><option value="DAMAGE">Trừ máu</option><option value="DESTROY">Xóa đối tượng thứ nhất</option><option value="WIN">Hoàn thành trò chơi</option></select></label>
        {(action === "SCORE" || action === "DAMAGE" || !!scoreStep) && <label>{action === "DAMAGE" ? "Sát thương" : "Số điểm"}<input aria-label={action === "DAMAGE" ? "Sát thương" : "Số điểm"} type="number" value={amount} onChange={(input) => setAmount(Number(input.target.value))} /></label>}
        {action === "DAMAGE" && <label>Đối tượng nhận sát thương<select aria-label="Đối tượng nhận sát thương" value={healthTarget?.component.id ?? ""} onChange={(input) => setHealthComponentId(input.target.value)}>{healthTargets.map(({ object, component }) => <option key={component.id} value={component.id}>{object.name}</option>)}</select></label>}
        <div><label>Thêm hành động<select aria-label="Thêm hành động" value={actionToAdd} onChange={(input) => setActionToAdd(input.target.value as ActionKind)}><option value="PLAY_AUDIO">Phát âm thanh</option></select></label><button type="button" onClick={addAction}>Thêm hành động</button></div>
        {audioStep?.type === "PLAY_AUDIO" && <label>Âm thanh<select aria-label="Âm thanh" value={audioStep.assetId} onChange={(input) => setSteps((current) => current.map((step) => step.id === audioStep.id && step.type === "PLAY_AUDIO" ? { ...step, assetId: input.target.value } : step))}>{state.document.assetIds.map((assetId) => <option key={assetId} value={assetId}>{assetId}</option>)}</select></label>}
        <label><input type="checkbox" checked={needsScore} onChange={(input) => setNeedsScore(input.target.checked)} /> Yêu cầu điểm tối thiểu</label>
        {needsScore && <label>Điểm tối thiểu<input aria-label="Điểm tối thiểu" type="number" value={goalScore} onChange={(input) => setGoalScore(Number(input.target.value))} /></label>}
        <button type="submit" disabled={!editable}>{editingId ? "Cập nhật luật" : "Tạo luật"}</button>
        {editingId && <button type="button" onClick={resetForm}>Hủy sửa</button>}
      </form>
      <div>
        <h3>Luật đang dùng ({state.document.events.length})</h3>
        {state.document.events.length === 0 ? <div className="studio-empty"><strong>Chưa có luật chơi</strong><p>Tạo luật đầu tiên ở bên trái. Bạn có thể hoàn tác mọi thay đổi.</p></div> : <ul className="studio-gameplay-rules">{state.document.events.map((event) => <li key={event.id}><div><strong>{event.name}</strong><span>{describeTrigger(event)} → {describeSteps(event)}</span>{!isSupportedRule(event) && <p>Chỉ đọc: luật này dùng trigger, điều kiện hoặc hành động phức tạp. Có thể xóa hoặc bật/tắt, nhưng chỉnh chi tiết trong Code/JSON để tránh mất dữ liệu.</p>}</div><label><input type="checkbox" checked={event.enabled} onChange={() => commit([{ type: "event.upsert", event: { ...event, enabled: !event.enabled } }])} /> Bật</label>{isSupportedRule(event) && <button type="button" onClick={() => loadRule(event)}>Sửa {event.name}</button>}<button type="button" onClick={() => commit([{ type: "event.delete", eventId: event.id }])}>Xóa</button></li>)}</ul>}
      </div>
    </div>
    <hr />
    <h3>Biến toàn trò chơi</h3>
    <p>Dùng biến để lưu nhiệm vụ, cấp độ hoặc trạng thái mà nhiều cảnh cùng đọc.</p>
    <div className="studio-variable-form"><label>Tên biến<input aria-label="Tên biến" value={variableName} onChange={(input) => setVariableName(input.target.value)} /></label><label>Kiểu<select value={variableType} onChange={(input) => setVariableType(input.target.value as VariableType)}><option value="NUMBER">Số</option><option value="BOOLEAN">Đúng / sai</option><option value="STRING">Văn bản</option></select></label><button type="button" disabled={!editable || !variableName.trim()} onClick={addVariable}>Thêm biến</button></div>
    {state.document.variables.global.length > 0 && <ul className="studio-variable-list">{state.document.variables.global.map((variable) => <li key={variable.id}><code>{variable.name}</code><span>{variable.type}</span><button type="button" onClick={() => commit([{ type: "project.variables", variables: { ...state.document.variables, global: state.document.variables.global.filter((item) => item.id !== variable.id) } }])}>Xóa</button></li>)}</ul>}
    {(validation || error) && <p role="alert">{validation || error}</p>}
  </section>;
}
