import { z } from "zod";
import { StableId } from "../stable-id.js";

export const V2_TRIGGER_TYPES = [
  "ON_START",
  "ON_CLICK",
  "ON_INTERACT",
  "ON_COLLISION",
  "ON_ENTER_AREA",
  "ON_EXIT_AREA",
  "ON_COLLECT_ITEM",
  "ON_TIMER",
  "ON_VARIABLE_CHANGED",
  "ON_KEY_PRESS",
  "ON_DIALOGUE_END",
  "ON_CHOICE_SELECTED",
  "CUSTOM",
] as const;

export const V2_CONDITION_TYPES = [
  "ALL",
  "ANY",
  "NOT",
  "VARIABLE_COMPARE",
  "ITEM_OWNED",
  "QUEST_STATE",
  "SCORE_COMPARE",
  "RANDOM_CHANCE",
  "PLAYER_POSITION",
  "OBJECT_EXISTS",
  "HAS_COMPONENT",
  "CUSTOM",
] as const;

export const V2_EVENT_STEP_TYPES = [
  "SHOW_DIALOGUE",
  "CHANGE_SCENE",
  "MOVE_OBJECT",
  "PLAY_ANIMATION",
  "PLAY_AUDIO",
  "STOP_AUDIO",
  "ADD_ITEM",
  "REMOVE_ITEM",
  "CHANGE_VARIABLE",
  "START_MINI_GAME",
  "SHOW_UI",
  "HIDE_UI",
  "SPAWN_OBJECT",
  "DESTROY_OBJECT",
  "RUN_SCRIPT",
  "ADD_SCORE",
  "CHANGE_HEALTH",
  "COMPLETE_GAME",
  "CUSTOM",
  "SEQUENCE",
  "WAIT",
  "IF_ELSE",
  "REPEAT",
] as const;

export const V2_EVENT_LIMITS = Object.freeze({
  events: 500,
  steps: 200,
  conditionDepth: 8,
  conditionChildren: 32,
  controlDepth: 8,
  controlChildren: 32,
  maxDelayMs: 86_400_000,
  maxRepeat: 100,
});

const finite = z.number().finite();
const boundedText = z.string().trim().min(1).max(120);
const registryKey = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const versionedId = { id: StableId, version: z.literal(1) };
const scalar = z.union([z.boolean(), finite, z.string().max(2_000)]);
const comparison = z.enum([
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
]);

export const VariableReferenceV2 = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("GLOBAL"), variableId: StableId }).strict(),
  z.object({ scope: z.literal("PLAYER"), variableId: StableId }).strict(),
  z
    .object({
      scope: z.literal("SCENE"),
      sceneId: StableId,
      variableId: StableId,
    })
    .strict(),
]);

const JsonConfig = z.record(z.unknown()).superRefine((root, context) => {
  const seen = new WeakSet<object>();
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ];
  let entries = 0;
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      continue;
    }
    if (typeof value !== "object" || depth > 8 || seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom node config must be bounded acyclic JSON",
      });
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    const validPrototype = Array.isArray(value)
      ? prototype === Array.prototype
      : prototype === Object.prototype || prototype === null;
    if (!validPrototype) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom node config must be bounded acyclic JSON",
      });
      return;
    }
    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    entries += children.length;
    if (children.length > 1_000 || entries > 10_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom node config exceeds its size limit",
      });
      return;
    }
    children.forEach((child) =>
      pending.push({ value: child, depth: depth + 1 }),
    );
  }
});

const customShape = { registryKey, config: JsonConfig };

export const EventTriggerV2 = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ON_START") }).strict(),
  z.object({ type: z.literal("ON_CLICK"), objectId: StableId }).strict(),
  z.object({ type: z.literal("ON_INTERACT"), objectId: StableId }).strict(),
  z
    .object({
      type: z.literal("ON_COLLISION"),
      firstObjectId: StableId,
      secondObjectId: StableId,
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_ENTER_AREA"),
      areaObjectId: StableId,
      enteringObjectId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_EXIT_AREA"),
      areaObjectId: StableId,
      exitingObjectId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_COLLECT_ITEM"),
      itemObjectId: StableId,
      collectorObjectId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_TIMER"),
      delayMs: finite.nonnegative().max(V2_EVENT_LIMITS.maxDelayMs),
      repeat: z.boolean(),
      intervalMs: finite.positive().max(V2_EVENT_LIMITS.maxDelayMs),
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_VARIABLE_CHANGED"),
      variable: VariableReferenceV2,
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_KEY_PRESS"),
      key: z.string().trim().min(1).max(64),
      repeat: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_DIALOGUE_END"),
      objectId: StableId,
      componentId: StableId,
    })
    .strict(),
  z
    .object({
      type: z.literal("ON_CHOICE_SELECTED"),
      objectId: StableId,
      componentId: StableId,
      choiceId: StableId,
    })
    .strict(),
  z.object({ type: z.literal("CUSTOM"), ...customShape }).strict(),
]);

const ConditionNodeShallow = z.discriminatedUnion("type", [
  z
    .object({
      ...versionedId,
      type: z.literal("ALL"),
      conditions: z
        .array(z.unknown())
        .min(1)
        .max(V2_EVENT_LIMITS.conditionChildren),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("ANY"),
      conditions: z
        .array(z.unknown())
        .min(1)
        .max(V2_EVENT_LIMITS.conditionChildren),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("NOT"),
      condition: z.unknown(),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("VARIABLE_COMPARE"),
      variable: VariableReferenceV2,
      operator: comparison,
      value: scalar,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("ITEM_OWNED"),
      itemId: StableId,
      quantity: z.number().int().positive().max(1_000_000),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("QUEST_STATE"),
      questComponentId: StableId,
      state: boundedText,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("SCORE_COMPARE"),
      operator: comparison,
      value: finite,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("RANDOM_CHANCE"),
      probability: finite.min(0).max(1),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("PLAYER_POSITION"),
      sceneId: StableId,
      x: finite,
      y: finite,
      radius: finite.nonnegative().max(65_536),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("OBJECT_EXISTS"),
      objectId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("HAS_COMPONENT"),
      objectId: StableId,
      componentId: StableId,
    })
    .strict(),
  z
    .object({ ...versionedId, type: z.literal("CUSTOM"), ...customShape })
    .strict(),
]);

export type VariableReferenceV2 = z.infer<typeof VariableReferenceV2>;
export type EventTriggerV2 = z.infer<typeof EventTriggerV2>;
type ShallowCondition = z.infer<typeof ConditionNodeShallow>;
export type EventConditionV2 =
  | {
      id: string;
      version: 1;
      type: "ALL" | "ANY";
      conditions: EventConditionV2[];
    }
  | { id: string; version: 1; type: "NOT"; condition: EventConditionV2 }
  | Exclude<ShallowCondition, { type: "ALL" | "ANY" | "NOT" }>;

function addNestedIssues(
  result: z.SafeParseReturnType<unknown, unknown>,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (!result.success) {
    result.error.issues.forEach((issue) =>
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: [...path, ...issue.path],
      }),
    );
  }
}

function validateConditionTree(root: unknown, context: z.RefinementCtx) {
  const ancestors = new WeakSet<object>();
  const visit = (value: unknown, depth: number, path: (string | number)[]) => {
    if (depth > V2_EVENT_LIMITS.conditionDepth) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Condition depth limit exceeded",
        path,
      });
      return;
    }
    if (typeof value === "object" && value !== null) {
      if (ancestors.has(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Condition cycle detected",
          path,
        });
        return;
      }
      ancestors.add(value);
    }
    const parsed = ConditionNodeShallow.safeParse(value);
    addNestedIssues(parsed, context, path);
    if (
      parsed.success &&
      (parsed.data.type === "ALL" || parsed.data.type === "ANY")
    ) {
      parsed.data.conditions.forEach((child, index) =>
        visit(child, depth + 1, [...path, "conditions", index]),
      );
    } else if (parsed.success && parsed.data.type === "NOT") {
      visit(parsed.data.condition, depth + 1, [...path, "condition"]);
    }
    if (typeof value === "object" && value !== null) ancestors.delete(value);
  };
  visit(root, 1, []);
}

function normalizeCondition(value: unknown): EventConditionV2 {
  const parsed = ConditionNodeShallow.parse(value);
  if (parsed.type === "ALL" || parsed.type === "ANY") {
    return { ...parsed, conditions: parsed.conditions.map(normalizeCondition) };
  }
  if (parsed.type === "NOT") {
    return { ...parsed, condition: normalizeCondition(parsed.condition) };
  }
  return parsed as EventConditionV2;
}

export const EventConditionV2: z.ZodType<
  EventConditionV2,
  z.ZodTypeDef,
  unknown
> = z
  .unknown()
  .superRefine(validateConditionTree)
  .transform(normalizeCondition);

const StepNodeShallow = z.discriminatedUnion("type", [
  z
    .object({
      ...versionedId,
      type: z.literal("SHOW_DIALOGUE"),
      objectId: StableId,
      componentId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("CHANGE_SCENE"),
      sceneId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("MOVE_OBJECT"),
      objectId: StableId,
      x: finite,
      y: finite,
      durationMs: finite.nonnegative().max(V2_EVENT_LIMITS.maxDelayMs),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("PLAY_ANIMATION"),
      objectId: StableId,
      componentId: StableId,
      clip: boundedText,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("PLAY_AUDIO"),
      assetId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("STOP_AUDIO"),
      assetId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("ADD_ITEM"),
      itemId: StableId,
      quantity: z.number().int().positive().max(1_000_000),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("REMOVE_ITEM"),
      itemId: StableId,
      quantity: z.number().int().positive().max(1_000_000),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("CHANGE_VARIABLE"),
      variable: VariableReferenceV2,
      operation: z.enum(["SET", "ADD", "SUBTRACT", "TOGGLE"]),
      value: scalar,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("START_MINI_GAME"),
      moduleId: StableId,
    })
    .strict(),
  z
    .object({ ...versionedId, type: z.literal("SHOW_UI"), objectId: StableId })
    .strict(),
  z
    .object({ ...versionedId, type: z.literal("HIDE_UI"), objectId: StableId })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("SPAWN_OBJECT"),
      prefabId: StableId,
      sceneId: StableId,
      x: finite,
      y: finite,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("DESTROY_OBJECT"),
      objectId: StableId,
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("RUN_SCRIPT"),
      scriptId: StableId,
    })
    .strict(),
  z
    .object({ ...versionedId, type: z.literal("ADD_SCORE"), amount: finite })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("CHANGE_HEALTH"),
      objectId: StableId,
      componentId: StableId,
      amount: finite,
    })
    .strict(),
  z.object({ ...versionedId, type: z.literal("COMPLETE_GAME") }).strict(),
  z
    .object({ ...versionedId, type: z.literal("CUSTOM"), ...customShape })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("SEQUENCE"),
      steps: z.array(z.unknown()).min(1).max(V2_EVENT_LIMITS.controlChildren),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("WAIT"),
      durationMs: finite.nonnegative().max(V2_EVENT_LIMITS.maxDelayMs),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("IF_ELSE"),
      condition: z.unknown(),
      thenSteps: z
        .array(z.unknown())
        .min(1)
        .max(V2_EVENT_LIMITS.controlChildren),
      elseSteps: z.array(z.unknown()).max(V2_EVENT_LIMITS.controlChildren),
    })
    .strict(),
  z
    .object({
      ...versionedId,
      type: z.literal("REPEAT"),
      times: z.number().int().positive().max(V2_EVENT_LIMITS.maxRepeat),
      steps: z.array(z.unknown()).min(1).max(V2_EVENT_LIMITS.controlChildren),
    })
    .strict(),
]);

type ShallowStep = z.infer<typeof StepNodeShallow>;
export type EventStepV2 =
  | Exclude<ShallowStep, { type: "SEQUENCE" | "REPEAT" | "IF_ELSE" }>
  | {
      id: string;
      version: 1;
      type: "SEQUENCE";
      steps: EventStepV2[];
    }
  | {
      id: string;
      version: 1;
      type: "REPEAT";
      times: number;
      steps: EventStepV2[];
    }
  | {
      id: string;
      version: 1;
      type: "IF_ELSE";
      condition: EventConditionV2;
      thenSteps: EventStepV2[];
      elseSteps: EventStepV2[];
    };

function validateStepTree(root: unknown, context: z.RefinementCtx) {
  const ancestors = new WeakSet<object>();
  let count = 0;
  const visit = (value: unknown, depth: number, path: (string | number)[]) => {
    count += 1;
    if (count > V2_EVENT_LIMITS.steps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Event step limit exceeded",
        path,
      });
      return;
    }
    if (depth > V2_EVENT_LIMITS.controlDepth) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Control-flow depth limit exceeded",
        path,
      });
      return;
    }
    if (typeof value === "object" && value !== null) {
      if (ancestors.has(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Control-flow cycle detected",
          path,
        });
        return;
      }
      ancestors.add(value);
    }
    const parsed = StepNodeShallow.safeParse(value);
    addNestedIssues(parsed, context, path);
    if (
      parsed.success &&
      (parsed.data.type === "SEQUENCE" || parsed.data.type === "REPEAT")
    ) {
      parsed.data.steps.forEach((child, index) =>
        visit(child, depth + 1, [...path, "steps", index]),
      );
    } else if (parsed.success && parsed.data.type === "IF_ELSE") {
      const condition = EventConditionV2.safeParse(parsed.data.condition);
      addNestedIssues(condition, context, [...path, "condition"]);
      parsed.data.thenSteps.forEach((child, index) =>
        visit(child, depth + 1, [...path, "thenSteps", index]),
      );
      parsed.data.elseSteps.forEach((child, index) =>
        visit(child, depth + 1, [...path, "elseSteps", index]),
      );
    }
    if (typeof value === "object" && value !== null) ancestors.delete(value);
  };
  visit(root, 1, []);
}

function normalizeStep(value: unknown): EventStepV2 {
  const parsed = StepNodeShallow.parse(value);
  if (parsed.type === "SEQUENCE" || parsed.type === "REPEAT")
    return { ...parsed, steps: parsed.steps.map(normalizeStep) };
  if (parsed.type === "IF_ELSE")
    return {
      ...parsed,
      condition: normalizeCondition(parsed.condition),
      thenSteps: parsed.thenSteps.map(normalizeStep),
      elseSteps: parsed.elseSteps.map(normalizeStep),
    };
  return parsed;
}

export const EventStepV2: z.ZodType<EventStepV2, z.ZodTypeDef, unknown> = z
  .unknown()
  .superRefine(validateStepTree)
  .transform(normalizeStep);

function countSteps(steps: EventStepV2[]): number {
  let count = 0;
  const pending = [...steps];
  while (pending.length > 0) {
    const step = pending.pop()!;
    count += 1;
    if (step.type === "SEQUENCE" || step.type === "REPEAT") {
      pending.push(...step.steps);
    } else if (step.type === "IF_ELSE") {
      pending.push(...step.thenSteps, ...step.elseSteps);
    }
  }
  return count;
}

export const GameEventV2 = z
  .object({
    id: StableId,
    version: z.literal(1),
    name: boundedText,
    enabled: z.boolean(),
    order: z.number().int().nonnegative(),
    trigger: EventTriggerV2,
    condition: EventConditionV2.nullable(),
    steps: z.array(EventStepV2).min(1).max(V2_EVENT_LIMITS.steps),
  })
  .strict()
  .superRefine((event, context) => {
    if (countSteps(event.steps) > V2_EVENT_LIMITS.steps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Event step limit exceeded",
        path: ["steps"],
      });
    }
  });

export type GameEventV2 = z.infer<typeof GameEventV2>;
