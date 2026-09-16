import type { EngineProjectV2 } from "../v2/project-schema.js";
import type { GameObjectV2 } from "../v2/scene-schema.js";
import type {
  EventConditionV2,
  EventStepV2,
  EventTriggerV2,
} from "../v2/event-schema.js";
export type RuntimeInput = {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
};
export type RuntimeEffect = { type: string; [key: string]: unknown };
/** Self-contained: embedded in the isolated browser player by the compiler. */
export function createGameRuntime(snapshot: EngineProjectV2) {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  let project = clone(snapshot);
  const state = {
    sceneId: project.entrySceneId,
    score: 0,
    status: "playing" as "playing" | "won" | "lost",
    time: 0,
    variables: {} as Record<string, string | number | boolean>,
    inventory: {} as Record<string, number>,
    diagnostics: [] as string[],
    effects: [] as RuntimeEffect[],
  };
  let contacts = new Set<string>(),
    timers = new Map<string, number>(),
    budget = 2000,
    generation = 0,
    serial = 0;
  let pending: { at: number; steps: EventStepV2[]; generation: number }[] = [];
  const properties = (
    o: GameObjectV2 | undefined,
    type: string,
  ): Record<string, any> | undefined =>
    o?.components.find((c) => c.type === type)?.properties as
      Record<string, any> | undefined;
  const scene = () => project.scenes.find((s) => s.id === state.sceneId)!;
  const object = (id: string) =>
    scene().objects.find((o) => o.id === id && o.enabled);
  const diagnostic = (message: string) => {
    const s = String(message).slice(0, 500);
    if (!state.diagnostics.includes(s)) {
      state.diagnostics.push(s);
      if (state.diagnostics.length > 30) state.diagnostics.shift();
    }
  };
  const effect = (e: RuntimeEffect) => {
    if (state.effects.length < 200) state.effects.push(e);
    else diagnostic("Effect budget exceeded");
  };
  const compare = (a: any, op: string, b: any) =>
    op === "EQUALS"
      ? a === b
      : op === "NOT_EQUALS"
        ? a !== b
        : op === "GREATER_THAN"
          ? a > b
          : op === "GREATER_THAN_OR_EQUAL"
            ? a >= b
            : op === "LESS_THAN"
              ? a < b
              : a <= b;
  function condition(c: EventConditionV2 | null): boolean {
    if (!c) return true;
    switch (c.type) {
      case "ALL":
        return c.conditions.every(condition);
      case "ANY":
        return c.conditions.some(condition);
      case "NOT":
        return !condition(c.condition);
      case "VARIABLE_COMPARE":
        return compare(
          state.variables[c.variable.variableId],
          c.operator,
          c.value,
        );
      case "SCORE_COMPARE":
        return compare(state.score, c.operator, c.value);
      case "ITEM_OWNED":
        return (state.inventory[c.itemId] ?? 0) >= c.quantity;
      case "OBJECT_EXISTS":
        return !!object(c.objectId);
      case "HAS_COMPONENT":
        return !!object(c.objectId)?.components.some(
          (x) => x.id === c.componentId,
        );
      case "PLAYER_POSITION":
        return (
          state.sceneId === c.sceneId &&
          scene().objects.some(
            (o) =>
              o.enabled &&
              o.objectType === "PLAYER" &&
              Math.hypot(
                properties(o, "Transform")!.x - c.x,
                properties(o, "Transform")!.y - c.y,
              ) <= c.radius,
          )
        );
      case "QUEST_STATE":
        return scene().objects.some(
          (o) =>
            o.enabled &&
            o.components.some(
              (x) =>
                x.id === c.questComponentId &&
                (x.properties as any).initialState === c.state,
            ),
        );
      default:
        diagnostic(`Unsupported condition: ${c.type}`);
        return false;
    }
  }
  function setVariable(id: string, value: unknown) {
    const d = [
      ...project.variables.global,
      ...project.variables.player,
      ...(project.variables.scene[state.sceneId] ?? []),
    ].find((v) => v.id === id);
    if (
      !d ||
      typeof value !== typeof d.initialValue ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (typeof value === "string" && value.length > 2000)
    ) {
      diagnostic("Invalid variable or value");
      return false;
    }
    const old = state.variables[id];
    state.variables[id] = value as string | number | boolean;
    if (old !== value) emit("ON_VARIABLE_CHANGED", { variableId: id });
    return true;
  }
  function changeScene(id: string) {
    if (!project.scenes.some((s) => s.id === id)) {
      diagnostic("Unknown scene");
      return false;
    }
    state.sceneId = id;
    generation++;
    contacts.clear();
    pending = [];
    timers.clear();
    state.time = 0;
    start();
    return true;
  }
  function spawn(prefabId: string, sceneId: string, x: number, y: number) {
    const p = project.prefabs.find((p) => p.id === prefabId),
      s = project.scenes.find((s) => s.id === sceneId);
    if (
      !p ||
      !s ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      s.objects.length >= 1000
    ) {
      diagnostic("Invalid or excessive spawn");
      return false;
    }
    const components = clone(p.components);
    for (const c of components) c.id = `runtime-component-${++serial}`;
    const t = components.find((c) => c.type === "Transform")!.properties as any;
    t.x = x;
    t.y = y;
    s.objects.push({
      id: `runtime-object-${++serial}`,
      name: p.name,
      objectType: p.objectType,
      parentId: null,
      layerId: s.layers.find((l) => l.type === "WORLD")?.id ?? s.layers[0].id,
      enabled: true,
      visible: true,
      locked: false,
      order: s.objects.length,
      renderOrder: 0,
      components,
    });
    return true;
  }
  function steps(list: EventStepV2[]) {
    list = [...list];
    const own = generation;
    for (let i = 0; i < list.length; i++) {
      if (--budget < 0) {
        diagnostic("Event action budget exceeded");
        return;
      }
      const s = list[i];
      switch (s.type) {
        case "SEQUENCE":
          list.splice(i + 1, 0, ...s.steps);
          break;
        case "REPEAT":
          if (s.steps.length * s.times > budget) {
            diagnostic("Event action budget exceeded");
            return;
          }
          list.splice(
            i + 1,
            0,
            ...Array.from({ length: s.times }, () => s.steps).flat(),
          );
          break;
        case "IF_ELSE":
          list.splice(
            i + 1,
            0,
            ...(condition(s.condition) ? s.thenSteps : s.elseSteps),
          );
          break;
        case "WAIT":
          if (pending.length < 200)
            pending.push({
              at: state.time + s.durationMs,
              steps: list.slice(i + 1),
              generation,
            });
          else diagnostic("Wait budget exceeded");
          return;
        case "ADD_SCORE":
          state.score += s.amount;
          break;
        case "COMPLETE_GAME":
          state.status = "won";
          break;
        case "CHANGE_HEALTH": {
          const o = object(s.objectId),
            c = o?.components.find(
              (c) => c.id === s.componentId && c.type === "Health",
            );
          if (c) {
            const h = c.properties as any;
            h.current = Math.max(0, Math.min(h.maximum, h.current + s.amount));
            if (h.current === 0 && o?.objectType === "PLAYER")
              state.status = "lost";
          }
          break;
        }
        case "DESTROY_OBJECT": {
          const o = object(s.objectId);
          if (o) o.enabled = false;
          break;
        }
        case "SHOW_UI":
        case "HIDE_UI": {
          const o = object(s.objectId);
          if (o) o.visible = s.type === "SHOW_UI";
          break;
        }
        case "MOVE_OBJECT": {
          const t = properties(object(s.objectId), "Transform");
          if (t) {
            if (s.durationMs)
              diagnostic(
                "MOVE_OBJECT duration unsupported; movement is immediate",
              );
            t.x = s.x;
            t.y = s.y;
          }
          break;
        }
        case "CHANGE_SCENE":
          changeScene(s.sceneId);
          break;
        case "ADD_ITEM":
          state.inventory[s.itemId] =
            (state.inventory[s.itemId] ?? 0) + s.quantity;
          break;
        case "REMOVE_ITEM":
          state.inventory[s.itemId] = Math.max(
            0,
            (state.inventory[s.itemId] ?? 0) - s.quantity,
          );
          break;
        case "CHANGE_VARIABLE": {
          const old = state.variables[s.variable.variableId];
          setVariable(
            s.variable.variableId,
            s.operation === "SET"
              ? s.value
              : s.operation === "TOGGLE"
                ? !old
                : s.operation === "ADD"
                  ? Number(old) + Number(s.value)
                  : Number(old) - Number(s.value),
          );
          break;
        }
        case "SPAWN_OBJECT":
          spawn(s.prefabId, s.sceneId, s.x, s.y);
          break;
        case "RUN_SCRIPT":
          effect({ type: "RUN_SCRIPT", scriptId: s.scriptId });
          break;
        case "PLAY_AUDIO":
        case "STOP_AUDIO":
          effect({ type: s.type, assetId: s.assetId });
          break;
        case "SHOW_DIALOGUE": {
          const d = object(s.objectId)?.components.find(
            (c) => c.id === s.componentId && c.type === "Dialogue",
          )?.properties as any;
          const n = d?.nodes.find((n: any) => n.id === d.startNodeId);
          if (n) effect({ type: "SHOW_DIALOGUE", text: n.text });
          diagnostic("Dialogue choices are not supported");
          break;
        }
        default:
          diagnostic(`Unsupported action: ${s.type}`);
      }
      if (generation !== own) return;
    }
  }
  function matches(t: EventTriggerV2, type: string, d: Record<string, any>) {
    if (t.type !== type) return false;
    switch (t.type) {
      case "ON_COLLISION":
        return (
          (t.firstObjectId === d.firstObjectId &&
            t.secondObjectId === d.secondObjectId) ||
          (t.firstObjectId === d.secondObjectId &&
            t.secondObjectId === d.firstObjectId)
        );
      case "ON_COLLECT_ITEM":
        return (
          t.itemObjectId === d.itemObjectId &&
          (!t.collectorObjectId || t.collectorObjectId === d.collectorObjectId)
        );
      case "ON_ENTER_AREA":
        return (
          t.areaObjectId === d.areaObjectId &&
          (!t.enteringObjectId || t.enteringObjectId === d.objectId)
        );
      case "ON_EXIT_AREA":
        return (
          t.areaObjectId === d.areaObjectId &&
          (!t.exitingObjectId || t.exitingObjectId === d.objectId)
        );
      case "ON_KEY_PRESS":
        return (
          t.key.toLowerCase() === String(d.key).toLowerCase() &&
          (!d.repeat || t.repeat)
        );
      case "ON_VARIABLE_CHANGED":
        return t.variable.variableId === d.variableId;
      case "ON_CLICK":
      case "ON_INTERACT":
        return t.objectId === d.objectId;
      default:
        return true;
    }
  }
  let eventDepth = 0;
  function runEvent(id: string) {
    if (eventDepth >= 32) {
      diagnostic("Event recursion budget exceeded");
      return;
    }
    eventDepth++;
    try {
      const e = project.events.find((e) => e.id === id);
      if (e?.enabled && condition(e.condition)) {
        steps(e.steps);
        for (const s of project.scripts)
          if (s.attachments.some((a) => a.type === "EVENT" && a.eventId === id))
            effect({ type: "RUN_SCRIPT", scriptId: s.id });
      }
    } finally {
      eventDepth--;
    }
  }
  function emit(type: string, data: Record<string, any> = {}) {
    const own = generation;
    for (const e of [...project.events].sort((a, b) => a.order - b.order)) {
      if (budget <= 0 || own !== generation) return;
      if (matches(e.trigger, type, data)) runEvent(e.id);
    }
  }
  function bounds(o: GameObjectV2) {
    const t = properties(o, "Transform")!,
      c = properties(o, "Collider") ?? properties(o, "Trigger") ?? t;
    return {
      x: t.x + (c.offsetX ?? 0),
      y: t.y + (c.offsetY ?? 0),
      // Collider offsets identify its top-left, as in the canonical render model.
      width: c.shape === "CIRCLE" ? c.radius * 2 : c.width,
      height: c.shape === "CIRCLE" ? c.radius * 2 : c.height,
    };
  }
  function overlap(a: GameObjectV2, b: GameObjectV2) {
    const x = bounds(a),
      y = bounds(b);
    return (
      x.x < y.x + y.width &&
      x.x + x.width > y.x &&
      x.y < y.y + y.height &&
      x.y + x.height > y.y
    );
  }
  function tick(delta: number, input: RuntimeInput = {}) {
    if (state.status !== "playing") return;
    budget = 2000;
    const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.05));
    state.time += dt * 1000;
    const current = new Set<string>(),
      active = scene().objects.filter((o) => o.enabled),
      own = generation;
    for (const actor of active) {
      const m = properties(actor, "Movement"),
        t = properties(actor, "Transform");
      if (!m || !t || m.controls !== "PLAYER") continue;
      let dx = Number(!!input.right) - Number(!!input.left),
        dy = Number(!!input.down) - Number(!!input.up);
      const length = Math.hypot(dx, dy) || 1;
      dx = (dx / length) * m.speed * dt;
      dy = (dy / length) * m.speed * dt;
      const subdivisions = Math.max(
        1,
        Math.min(256, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4)),
      );
      for (let part = 0; part < subdivisions; part++)
        for (const axis of ["x", "y"] as const) {
          const before = t[axis];
          t[axis] += (axis === "x" ? dx : dy) / subdivisions;
          for (const other of active) {
            if (
              other.id === actor.id ||
              !other.enabled ||
              !properties(other, "Collider") ||
              !overlap(actor, other)
            )
              continue;
            const c = properties(other, "Collider")!;
            if (
              !c.isTrigger &&
              properties(actor, "Collider") &&
              !properties(actor, "Collider")!.isTrigger
            ) {
              t[axis] = before;
              const key = [actor.id, other.id].sort().join("|");
              current.add(key);
              if (!contacts.has(key)) {
                contacts.add(key);
                emit("ON_COLLISION", {
                  firstObjectId: actor.id,
                  secondObjectId: other.id,
                });
              }
            }
          }
        }
      t.x = Math.max(0, Math.min(scene().width - t.width, t.x));
      t.y = Math.max(0, Math.min(scene().height - t.height, t.y));
      for (const other of active) {
        if (
          other.id === actor.id ||
          !other.enabled ||
          (!properties(other, "Collider") && !properties(other, "Trigger")) ||
          !overlap(actor, other)
        )
          continue;
        const key = [actor.id, other.id].sort().join("|");
        current.add(key);
        if (!contacts.has(key)) {
          contacts.add(key);
          emit("ON_COLLISION", {
            firstObjectId: actor.id,
            secondObjectId: other.id,
          });
          emit("ON_ENTER_AREA", { areaObjectId: other.id, objectId: actor.id });
          const item = properties(other, "InventoryItem");
          if (item?.collectible && other.enabled) {
            state.inventory[other.id] = (state.inventory[other.id] ?? 0) + 1;
            emit("ON_COLLECT_ITEM", {
              itemObjectId: other.id,
              collectorObjectId: actor.id,
            });
            if (item.triggerEventId) runEvent(item.triggerEventId);
            other.enabled = false;
          }
        }
      }
      if (own !== generation) return;
    }
    for (const key of contacts)
      if (!current.has(key)) {
        const [a, b] = key.split("|");
        emit("ON_EXIT_AREA", { areaObjectId: a, objectId: b });
        emit("ON_EXIT_AREA", { areaObjectId: b, objectId: a });
      }
    contacts = current;
    for (const e of project.events)
      if (e.enabled && e.trigger.type === "ON_TIMER") {
        const t = e.trigger,
          next = timers.get(e.id) ?? t.delayMs;
        if (state.time >= next) {
          timers.set(e.id, t.repeat ? state.time + t.intervalMs : Infinity);
          runEvent(e.id);
        }
      }
    const due = pending.filter((p) => p.at <= state.time);
    pending = pending.filter((p) => p.at > state.time);
    for (const p of due) if (p.generation === generation) steps(p.steps);
  }
  function start() {
    for (const o of scene().objects) {
      const t = properties(o, "Transform")!;
      if (
        properties(o, "Collider") &&
        (o.parentId || t.rotation || t.scaleX !== 1 || t.scaleY !== 1)
      )
        diagnostic(
          "Physics for transformed or parented colliders uses untransformed local rectangles",
        );
    }
    for (const e of project.events)
      if (
        e.enabled &&
        ["ON_DIALOGUE_END", "ON_CHOICE_SELECTED", "CUSTOM"].includes(
          e.trigger.type,
        )
      )
        diagnostic(`Unsupported trigger: ${e.trigger.type}`);
    for (const o of scene().objects)
      for (const c of o.components) {
        if (
          ["Animator", "Tilemap", "MiniGame", "Custom", "Trigger"].includes(
            c.type,
          )
        )
          diagnostic(`Unsupported component: ${c.type}`);
        if (c.type === "Movement" && (c.properties as any).controls === "AI")
          diagnostic("AI movement unsupported");
        if (
          c.type === "Collider" &&
          (c.properties as any).shape !== "RECTANGLE"
        )
          diagnostic("Circle collider uses bounding rectangle");
      }
    if (scene().settings.gravityX || scene().settings.gravityY)
      diagnostic("Gravity unsupported in top-down runtime");
    emit("ON_START");
    for (const s of project.scripts)
      if (
        s.attachments.some(
          (a) =>
            (a.type === "SCENE" && a.sceneId === state.sceneId) ||
            (a.type === "OBJECT" && !!object(a.objectId)),
        ) ||
        scene().objects.some(
          (o) => o.enabled && properties(o, "Script")?.scriptIds.includes(s.id),
        )
      )
        effect({ type: "RUN_SCRIPT", scriptId: s.id });
  }
  function restart() {
    project = clone(snapshot);
    state.sceneId = project.entrySceneId;
    state.score = 0;
    state.status = "playing";
    state.time = 0;
    state.inventory = {};
    state.variables = {};
    state.effects = [];
    state.diagnostics = [];
    contacts.clear();
    timers.clear();
    pending = [];
    budget = 2000;
    generation++;
    for (const v of [
      ...project.variables.global,
      ...project.variables.player,
      ...Object.values(project.variables.scene).flat(),
    ])
      state.variables[v.id] = v.initialValue;
    start();
  }
  function command(scriptId: string, raw: unknown) {
    budget = 2000;
    const s = project.scripts.find((s) => s.id === scriptId);
    if (!raw || typeof raw !== "object") return false;
    const c = raw as Record<string, any>;
    if (!s?.capabilities.includes(c.type)) {
      diagnostic(`Script capability denied: ${String(c.type).slice(0, 80)}`);
      return false;
    }
    switch (c.type) {
      case "SET_VARIABLE":
        return setVariable(c.variableId, c.value);
      case "CHANGE_SCENE":
        return changeScene(c.sceneId);
      case "SPAWN_OBJECT":
        return spawn(c.prefabId, state.sceneId, c.x, c.y);
      case "PLAY_AUDIO":
        if (project.assetIds.includes(c.assetId)) {
          effect({ type: "PLAY_AUDIO", assetId: c.assetId });
          return true;
        }
        return false;
      case "SHOW_DIALOGUE":
        if (typeof c.text === "string") {
          effect({ type: "SHOW_DIALOGUE", text: c.text.slice(0, 2000) });
          return true;
        }
        return false;
      default:
        return false;
    }
  }
  restart();
  return {
    state,
    scene,
    properties,
    tick,
    restart,
    command,
    diagnostic,
    condition,
    emit: (type: string, data: Record<string, any> = {}) => {
      budget = 2000;
      emit(type, data);
    },
    getProject: () => project,
  };
}
