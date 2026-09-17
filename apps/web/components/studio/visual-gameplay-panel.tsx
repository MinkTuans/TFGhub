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
  const [trigger, setTrigger] = useState<"START" | "TIMER" | "KEY">("START");
  const [action, setAction] = useState<"SCORE" | "WIN">("SCORE");
  const [amount, setAmount] = useState(10);
  const [delay, setDelay] = useState(2);
  const [key, setKey] = useState("Space");
  const [variableName, setVariableName] = useState("scoreMultiplier");
  const [variableType, setVariableType] = useState<VariableType>("NUMBER");

  function createRule() {
    const event: Event = {
      id: createStudioId(), version: 1, name: name.trim() || "Luật mới", enabled: true,
      order: state.document.events.length,
      trigger: trigger === "TIMER"
        ? { type: "ON_TIMER", delayMs: Math.max(0, delay * 1000), repeat: false, intervalMs: Math.max(1, delay * 1000) }
        : trigger === "KEY" ? { type: "ON_KEY_PRESS", key: key.trim() || "Space", repeat: false } : { type: "ON_START" },
      condition: null,
      steps: [action === "WIN"
        ? { id: createStudioId(), version: 1, type: "COMPLETE_GAME" }
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
        <label>Khi<select value={trigger} onChange={(input) => setTrigger(input.target.value as typeof trigger)}><option value="START">Màn chơi bắt đầu</option><option value="TIMER">Hết thời gian chờ</option><option value="KEY">Người chơi nhấn phím</option></select></label>
        {trigger === "TIMER" && <label>Số giây<input type="number" min="0" value={delay} onChange={(input) => setDelay(Number(input.target.value))} /></label>}
        {trigger === "KEY" && <label>Phím<input value={key} onChange={(input) => setKey(input.target.value)} /></label>}
        <label>Thì<select value={action} onChange={(input) => setAction(input.target.value as typeof action)}><option value="SCORE">Cộng điểm</option><option value="WIN">Hoàn thành trò chơi</option></select></label>
        {action === "SCORE" && <label>Số điểm<input type="number" value={amount} onChange={(input) => setAmount(Number(input.target.value))} /></label>}
        <button type="submit" disabled={!editable}>Tạo luật</button>
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
