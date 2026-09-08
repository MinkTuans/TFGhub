import { z } from 'zod';
import { StableId } from './stable-id.js';

export const TRIGGER_TYPES = [
  'GAME_START',
  'COLLISION',
  'CLICK',
  'KEY_PRESS',
  'TIMER',
  'DIALOGUE_END',
  'CHOICE_SELECTED',
] as const;

export const CONDITION_TYPES = [
  'ALL',
  'ANY',
  'NOT',
  'COMPARE_VARIABLE',
  'OBJECT_EXISTS',
  'HAS_COMPONENT',
] as const;

export const ACTION_TYPES = [
  'CHANGE_SCENE',
  'MOVE_OBJECT',
  'CREATE_OBJECT',
  'DESTROY_OBJECT',
  'PLAY_ANIMATION',
  'PLAY_AUDIO',
  'CHANGE_VARIABLE',
  'ADD_SCORE',
  'CHANGE_HEALTH',
  'SHOW_DIALOGUE',
  'COMPLETE_GAME',
] as const;

export const EVENT_LIMITS = Object.freeze({
  events: 500,
  actions: 100,
  conditionDepth: 8,
  conditionChildren: 32,
});

const finite = z.number().finite();
const boundedText = z.string().trim().min(1).max(120);
const versionedId = { id: StableId, version: z.literal(1) };

const VariableReference = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('GLOBAL'), variableId: StableId }).strict(),
  z.object({ scope: z.literal('PLAYER'), variableId: StableId }).strict(),
  z.object({ scope: z.literal('SCENE'), sceneId: StableId, variableId: StableId }).strict(),
]);

export const EventTriggerV1 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GAME_START') }).strict(),
  z.object({
    type: z.literal('COLLISION'),
    firstObjectId: StableId,
    secondObjectId: StableId,
  }).strict(),
  z.object({ type: z.literal('CLICK'), objectId: StableId }).strict(),
  z.object({
    type: z.literal('KEY_PRESS'),
    key: z.string().trim().min(1).max(64),
    repeat: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal('TIMER'),
    delayMs: finite.nonnegative().max(86_400_000),
    repeat: z.boolean(),
    intervalMs: finite.positive().max(86_400_000),
  }).strict(),
  z.object({
    type: z.literal('DIALOGUE_END'),
    objectId: StableId,
    componentId: StableId,
  }).strict(),
  z.object({
    type: z.literal('CHOICE_SELECTED'),
    objectId: StableId,
    componentId: StableId,
    choiceId: StableId,
  }).strict(),
]);

const ConditionNodeShallow = z.discriminatedUnion('type', [
  z.object({ ...versionedId, type: z.literal('ALL'), conditions: z.array(z.unknown()).min(1).max(EVENT_LIMITS.conditionChildren) }).strict(),
  z.object({ ...versionedId, type: z.literal('ANY'), conditions: z.array(z.unknown()).min(1).max(EVENT_LIMITS.conditionChildren) }).strict(),
  z.object({ ...versionedId, type: z.literal('NOT'), condition: z.unknown() }).strict(),
  z.object({
    ...versionedId,
    type: z.literal('COMPARE_VARIABLE'),
    variable: VariableReference,
    operator: z.enum(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL']),
    value: z.union([z.boolean(), finite, z.string().max(2_000)]),
  }).strict(),
  z.object({ ...versionedId, type: z.literal('OBJECT_EXISTS'), objectId: StableId }).strict(),
  z.object({
    ...versionedId,
    type: z.literal('HAS_COMPONENT'),
    objectId: StableId,
    componentId: StableId,
  }).strict(),
]);

export type VariableReferenceV1 = z.infer<typeof VariableReference>;
export type EventTriggerV1 = z.infer<typeof EventTriggerV1>;
export type ConditionV1 =
  | { id: string; version: 1; type: 'ALL'; conditions: ConditionV1[] }
  | { id: string; version: 1; type: 'ANY'; conditions: ConditionV1[] }
  | { id: string; version: 1; type: 'NOT'; condition: ConditionV1 }
  | { id: string; version: 1; type: 'COMPARE_VARIABLE'; variable: VariableReferenceV1; operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL'; value: boolean | number | string }
  | { id: string; version: 1; type: 'OBJECT_EXISTS'; objectId: string }
  | { id: string; version: 1; type: 'HAS_COMPONENT'; objectId: string; componentId: string };

function validateCondition(root: unknown, context: z.RefinementCtx) {
  const ancestors = new WeakSet<object>();

  const visit = (value: unknown, depth: number, path: (string | number)[]) => {
    if (depth > EVENT_LIMITS.conditionDepth) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Condition depth limit exceeded', path });
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (ancestors.has(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Condition cycle detected', path });
        return;
      }
      ancestors.add(value);
    }

    const parsed = ConditionNodeShallow.safeParse(value);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: [...path, ...issue.path],
      }));
    } else if (parsed.data.type === 'ALL' || parsed.data.type === 'ANY') {
      parsed.data.conditions.forEach((child, index) => visit(child, depth + 1, [...path, 'conditions', index]));
    } else if (parsed.data.type === 'NOT') {
      visit(parsed.data.condition, depth + 1, [...path, 'condition']);
    }

    if (typeof value === 'object' && value !== null) ancestors.delete(value);
  };

  visit(root, 1, []);
}

function normalizeCondition(value: unknown): ConditionV1 {
  const parsed = ConditionNodeShallow.parse(value);
  if (parsed.type === 'ALL' || parsed.type === 'ANY') {
    return { ...parsed, conditions: parsed.conditions.map(normalizeCondition) };
  }
  if (parsed.type === 'NOT') {
    return { ...parsed, condition: normalizeCondition(parsed.condition) };
  }
  return parsed;
}

export const EventConditionV1: z.ZodType<ConditionV1, z.ZodTypeDef, unknown> = z.unknown()
  .superRefine(validateCondition)
  .transform(normalizeCondition);

export const EventActionV1 = z.discriminatedUnion('type', [
  z.object({ ...versionedId, type: z.literal('CHANGE_SCENE'), sceneId: StableId }).strict(),
  z.object({ ...versionedId, type: z.literal('MOVE_OBJECT'), objectId: StableId, x: finite, y: finite }).strict(),
  z.object({ ...versionedId, type: z.literal('CREATE_OBJECT'), prefabId: StableId, sceneId: StableId, x: finite, y: finite }).strict(),
  z.object({ ...versionedId, type: z.literal('DESTROY_OBJECT'), objectId: StableId }).strict(),
  z.object({ ...versionedId, type: z.literal('PLAY_ANIMATION'), objectId: StableId, componentId: StableId, clip: boundedText }).strict(),
  z.object({ ...versionedId, type: z.literal('PLAY_AUDIO'), assetId: StableId }).strict(),
  z.object({ ...versionedId, type: z.literal('CHANGE_VARIABLE'), variable: VariableReference, value: z.union([z.boolean(), finite, z.string().max(2_000)]) }).strict(),
  z.object({ ...versionedId, type: z.literal('ADD_SCORE'), amount: finite }).strict(),
  z.object({ ...versionedId, type: z.literal('CHANGE_HEALTH'), objectId: StableId, componentId: StableId, amount: finite }).strict(),
  z.object({ ...versionedId, type: z.literal('SHOW_DIALOGUE'), objectId: StableId, componentId: StableId }).strict(),
  z.object({ ...versionedId, type: z.literal('COMPLETE_GAME') }).strict(),
]);

export const GameEventV1 = z.object({
  id: StableId,
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  trigger: EventTriggerV1,
  condition: EventConditionV1.nullable(),
  actions: z.array(EventActionV1).min(1).max(EVENT_LIMITS.actions),
}).strict();

export type EventActionV1 = z.infer<typeof EventActionV1>;
export type GameEventV1 = z.infer<typeof GameEventV1>;
