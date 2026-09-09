export {
  COMPONENT_TYPES,
  componentRegistry,
  type ComponentDefinition,
  type ComponentType,
} from "./component-registry.js";
export {
  ENGINE_LIMITS,
  ENGINE_PROJECT_SCHEMA_VERSION,
  EngineProjectV1,
  type EngineProjectV1 as EngineProjectV1Type,
} from "./project-schema.js";
export {
  readEngineProject,
  type EngineProjectReadResult,
  type ReadEngineProjectResult,
} from "./read-result.js";
export {
  StableId,
  createStableId,
  type StableId as StableIdType,
} from "./stable-id.js";
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
} from "./event-schema.js";
export {
  LEGACY_ID_NAMESPACE,
  adaptLegacyProject,
  uuidV5,
  type LegacyAdapterResult,
} from "./adapters/index.js";
export { adaptStoryV0 } from "./adapters/story-v0.js";
export { adaptPlatformerV0 } from "./adapters/platformer-v0.js";
export {
  V2_COMPONENT_TYPES,
  V2_GEOMETRY_LIMITS,
  V2_LAYER_TYPES,
  v2ComponentRegistry,
  validateV2ComponentContext,
  type V2ComponentContext,
  type V2ComponentDefinition,
  type V2ComponentType,
  type V2LayerType,
} from "./v2/component-registry.js";
export {
  ComponentInstanceV2,
  GameObjectV2,
  LayerV2,
  SceneV2,
  V2_OBJECT_TYPES,
  V2_SCENE_LIMITS,
  V2_SCENE_TYPES,
  type ComponentInstanceV2 as ComponentInstanceV2Type,
  type GameObjectV2 as GameObjectV2Type,
  type LayerV2 as LayerV2Type,
  type SceneV2 as SceneV2Type,
  type V2ObjectType,
  type V2SceneType,
} from "./v2/scene-schema.js";
export {
  EventConditionV2,
  EventStepV2,
  EventTriggerV2,
  GameEventV2,
  V2_CONDITION_TYPES,
  V2_EVENT_LIMITS,
  V2_EVENT_STEP_TYPES,
  V2_TRIGGER_TYPES,
  VariableReferenceV2,
  type EventConditionV2 as EventConditionV2Type,
  type EventStepV2 as EventStepV2Type,
  type EventTriggerV2 as EventTriggerV2Type,
  type GameEventV2 as GameEventV2Type,
  type VariableReferenceV2 as VariableReferenceV2Type,
} from "./v2/event-schema.js";
export {
  validateGameEventV2,
  type V2EventValidationContext,
  type V2VariableType,
} from "./v2/event-validation.js";
export {
  MiniGameDefinitionV2,
  MiniGameResultV2,
  V2_MINI_GAME_LIMITS,
  V2_MINI_GAME_TYPES,
  v2MiniGameRegistry,
  validateMiniGameDefinitionV2,
  validateMiniGameResultV2,
  type MiniGameDefinitionV2 as MiniGameDefinitionV2Type,
  type MiniGameResultV2 as MiniGameResultV2Type,
  type V2MiniGameValidationContext,
  type V2MiniGameVariableType,
} from "./v2/module-schema.js";
export {
  ScriptResourceV2,
  V2_SCRIPT_CAPABILITIES,
  V2_SCRIPT_LIMITS,
  validateScriptResourceV2,
  type ScriptResourceV2 as ScriptResourceV2Type,
  type V2ScriptValidationContext,
} from "./v2/script-schema.js";
export {
  ENGINE_PROJECT_V2_SCHEMA_VERSION,
  ENGINE_V2_LIMITS,
  EngineProjectV2,
  PrefabV2,
  type EngineProjectV2 as EngineProjectV2Type,
  type PrefabV2 as PrefabV2Type,
} from "./v2/project-schema.js";
export { upgradeEngineProjectV1 } from "./v2/upgrade-v1.js";
export {
  SceneMutation,
  ProjectMutation,
  ProjectMutationTargetError,
  applyProjectMutations,
  applyProjectMutationsWithHistory,
} from "./v2/mutations.js";
