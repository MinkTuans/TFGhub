export {
  COMPONENT_TYPES,
  componentRegistry,
  type ComponentDefinition,
  type ComponentType,
} from './component-registry.js';
export {
  ENGINE_LIMITS,
  ENGINE_PROJECT_SCHEMA_VERSION,
  EngineProjectV1,
  type EngineProjectV1 as EngineProjectV1Type,
} from './project-schema.js';
export {
  readEngineProject,
  type EngineProjectReadResult,
} from './read-result.js';
export { StableId, createStableId, type StableId as StableIdType } from './stable-id.js';
export {
  ACTION_TYPES,
  CONDITION_TYPES,
  EVENT_LIMITS,
  EventActionV1,
  EventConditionV1,
  EventTriggerV1,
  GameEventV1,
  TRIGGER_TYPES,
  type ConditionV1,
  type EventActionV1 as EventActionV1Type,
  type EventTriggerV1 as EventTriggerV1Type,
  type GameEventV1 as GameEventV1Type,
  type VariableReferenceV1,
} from './event-schema.js';
export {
  LEGACY_ID_NAMESPACE,
  adaptLegacyProject,
  uuidV5,
  type LegacyAdapterResult,
} from './adapters/index.js';
export { adaptStoryV0 } from './adapters/story-v0.js';
export { adaptPlatformerV0 } from './adapters/platformer-v0.js';
