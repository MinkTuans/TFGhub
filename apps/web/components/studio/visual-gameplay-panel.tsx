"use client";

import { useState } from "react";
import type { EngineProjectV2Type } from "@indieforge/contracts";
import { createStudioId, useStudio } from "./studio-provider";
import { prepareStudioCommit } from "./studio-history";
import { studioValidationMessage } from "./component-editor";
import type { StudioMutation } from "./studio-state";

type Event = EngineProjectV2Type["events"][number];
type VariableType = "BOOLEAN" | "NUMBER" | "STRING";

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

export function VisualGameplayPanel() {
  const { state, editable, commit, error } = useGameplayCommit();
  const [name, setName] = useState("Luật mới");
  const [trigger, setTrigger] = useState<"START" | "TIMER" | "KEY" | "COLLISION" | "COLLECT" | "ENTER">("START");
  const [action, setAction] = useState<"SCORE" | "WIN" | "DAMAGE" | "DESTROY">("SCORE");
  const [amount, setAmount] = useState(10);
  const [delay, setDelay] = useState(2);
  const [key, setKey] = useState("Space");
  const [variableName, setVariableName] = useState("scoreMultiplier");
  const [variableType, setVariableType] = useState<VariableType>("NUMBER");
  const objects = state.document.scenes.flatMap((scene) => scene.objects);
  const [firstObjectId, setFirstObjectId] = useState("");
  const [secondObjectId, setSecondObjectId] = useState("");
  const player = objects.find((object) => object.objectType === "PLAYER");
  const collectible = objects.find((object) =>
    object.components.some((component) => component.type === "InventoryItem"),
  );
  const area = objects.find((object) => object.objectType === "TRIGGER");
  const otherHealthObject = objects.find(
    (object) =>
      object.id !== player?.id &&
      object.components.some((component) => component.type === "Health"),
  );
  const suggestedFirstId =
    trigger === "COLLECT"
      ? collectible?.id
      : trigger === "ENTER"
        ? area?.id
        : trigger === "COLLISION"
          ? player?.id
          : undefined;
  const suggestedSecondId =
    trigger === "COLLECT" || trigger === "ENTER"
      ? player?.id
      : trigger === "COLLISION"
        ? otherHealthObject?.id ?? collectible?.id
        : undefined;
  const firstId = firstObjectId || suggestedFirstId || "";
  const secondId = secondObjectId || suggestedSecondId || "";
  const healthTargets = objects.flatMap((object) => object.components.filter((component) => component.type === "Health").map((component) => ({ object, component })));
  const [healthComponentId, setHealthComponentId] = useState("");
  const healthTarget = healthTargets.find(({ component }) => component.id === healthComponentId) ?? healthTargets[0];

  function createRule() {
    const event: Event = {
      id: createStudioId(), version: 1, name: name.trim() || "Luật mới", enabled: true,
      order: state.document.events.length,
      trigger: trigger === "COLLISION"
        ? { type: "ON_COLLISION", firstObjectId: firstId, secondObjectId: secondId }
        : trigger === "COLLECT"
          ? { type: "ON_COLLECT_ITEM", itemObjectId: firstId, collectorObjectId: secondId || null }
          : trigger === "ENTER"
            ? { type: "ON_ENTER_AREA", areaObjectId: firstId, enteringObjectId: secondId || null }
            : trigger === "TIMER"
        ? { type: "ON_TIMER", delayMs: Math.max(0, delay * 1000), repeat: false, intervalMs: Math.max(1, delay * 1000) }
        : trigger === "KEY" ? { type: "ON_KEY_PRESS", key: key.trim() || "Space", repeat: false } : { type: "ON_START" },
      condition: null,
      steps: [action === "WIN"
        ? { id: createStudioId(), version: 1, type: "COMPLETE_GAME" }
        : action === "DAMAGE" && healthTarget
          ? { id: createStudioId(), version: 1, type: "CHANGE_HEALTH", objectId: healthTarget.object.id, componentId: healthTarget.component.id, amount: -Math.abs(amount) }
          : action === "DESTROY"
            ? { id: createStudioId(), version: 1, type: "DESTROY_OBJECT", objectId: firstId }
            : { id: createStudioId(), version: 1, type: "ADD_SCORE", amount }],
    };
    commit([{ type: "event.upsert", event }]);
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
        <h3>Tạo luật</h3>
        <label>Tên luật<input aria-label="Tên luật" value={name} onChange={(input) => setName(input.target.value)} /></label>
        <label>Khi<select aria-label="Loại sự kiện" value={trigger} onChange={(input) => setTrigger(input.target.value as typeof trigger)}><option value="START">Màn chơi bắt đầu</option><option value="COLLISION">Hai đối tượng chạm nhau</option><option value="COLLECT">Nhặt vật phẩm</option><option value="ENTER">Đi vào vùng</option><option value="TIMER">Hết thời gian chờ</option><option value="KEY">Người chơi nhấn phím</option></select></label>
        {(["COLLISION", "COLLECT", "ENTER"] as const).includes(trigger as "COLLISION" | "COLLECT" | "ENTER") && <><label>{trigger === "COLLECT" ? "Vật phẩm" : trigger === "ENTER" ? "Vùng" : "Đối tượng thứ nhất"}<select aria-label="Đối tượng thứ nhất" value={firstId} onChange={(input) => setFirstObjectId(input.target.value)}>{objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label><label>{trigger === "COLLECT" ? "Người nhặt" : trigger === "ENTER" ? "Đối tượng đi vào" : "Đối tượng thứ hai"}<select aria-label="Đối tượng thứ hai" value={secondId} onChange={(input) => setSecondObjectId(input.target.value)}>{objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label></>}
        {trigger === "TIMER" && <label>Số giây<input type="number" min="0" value={delay} onChange={(input) => setDelay(Number(input.target.value))} /></label>}
        {trigger === "KEY" && <label>Phím<input value={key} onChange={(input) => setKey(input.target.value)} /></label>}
        <label>Thì<select aria-label="Loại hành động" value={action} onChange={(input) => setAction(input.target.value as typeof action)}><option value="SCORE">Cộng điểm</option><option value="DAMAGE">Trừ máu</option><option value="DESTROY">Xóa đối tượng thứ nhất</option><option value="WIN">Hoàn thành trò chơi</option></select></label>
        {(action === "SCORE" || action === "DAMAGE") && <label>{action === "SCORE" ? "Số điểm" : "Sát thương"}<input type="number" value={amount} onChange={(input) => setAmount(Number(input.target.value))} /></label>}
        {action === "DAMAGE" && <label>Đối tượng nhận sát thương<select aria-label="Đối tượng nhận sát thương" value={healthTarget?.component.id ?? ""} onChange={(input) => setHealthComponentId(input.target.value)}>{healthTargets.map(({ object, component }) => <option key={component.id} value={component.id}>{object.name}</option>)}</select></label>}
        <button type="submit" disabled={!editable || ((trigger === "COLLISION" || trigger === "COLLECT" || trigger === "ENTER" || action === "DESTROY") && !firstId) || (trigger === "COLLISION" && !secondId) || (action === "DAMAGE" && !healthTarget)}>Tạo luật</button>
      </form>
      <div>
        <h3>Luật đang dùng ({state.document.events.length})</h3>
        {state.document.events.length === 0 ? <div className="studio-empty"><strong>Chưa có luật chơi</strong><p>Tạo luật đầu tiên ở bên trái. Bạn có thể hoàn tác mọi thay đổi.</p></div> : <ul className="studio-gameplay-rules">{state.document.events.map((event) => <li key={event.id}><div><strong>{event.name}</strong><span>{describeTrigger(event)} → {describeSteps(event)}</span></div><label><input type="checkbox" checked={event.enabled} onChange={() => commit([{ type: "event.upsert", event: { ...event, enabled: !event.enabled } }])} /> Bật</label><button type="button" onClick={() => commit([{ type: "event.delete", eventId: event.id }])}>Xóa</button></li>)}</ul>}
      </div>
    </div>
    <hr />
    <h3>Biến toàn trò chơi</h3>
    <p>Dùng biến để lưu nhiệm vụ, cấp độ hoặc trạng thái mà nhiều cảnh cùng đọc.</p>
    <div className="studio-variable-form"><label>Tên biến<input aria-label="Tên biến" value={variableName} onChange={(input) => setVariableName(input.target.value)} /></label><label>Kiểu<select value={variableType} onChange={(input) => setVariableType(input.target.value as VariableType)}><option value="NUMBER">Số</option><option value="BOOLEAN">Đúng / sai</option><option value="STRING">Văn bản</option></select></label><button type="button" disabled={!editable || !variableName.trim()} onClick={addVariable}>Thêm biến</button></div>
    {state.document.variables.global.length > 0 && <ul className="studio-variable-list">{state.document.variables.global.map((variable) => <li key={variable.id}><code>{variable.name}</code><span>{variable.type}</span><button type="button" onClick={() => commit([{ type: "project.variables", variables: { ...state.document.variables, global: state.document.variables.global.filter((item) => item.id !== variable.id) } }])}>Xóa</button></li>)}</ul>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
