import type { V2ComponentType } from "./component-registry.js";
import type { V2ObjectType } from "./scene-schema.js";
import type {
  EventConditionV2,
  EventStepV2,
  GameEventV2,
  VariableReferenceV2,
} from "./event-schema.js";

export type V2VariableType = "STRING" | "NUMBER" | "BOOLEAN";

export type V2EventValidationContext = {
  sceneIds: ReadonlySet<string>;
  objectIds: ReadonlySet<string>;
  objectTypes: ReadonlyMap<string, V2ObjectType>;
  components: ReadonlyMap<string, { objectId: string; type: V2ComponentType }>;
  assetIds: ReadonlySet<string>;
  prefabIds: ReadonlySet<string>;
  globalVariables: ReadonlyMap<string, V2VariableType>;
  playerVariables: ReadonlyMap<string, V2VariableType>;
  sceneVariables: ReadonlyMap<string, ReadonlyMap<string, V2VariableType>>;
  dialogueChoiceIds: ReadonlySet<string>;
  dialogueChoices: ReadonlyMap<string, string>;
  scriptIds: ReadonlySet<string>;
  moduleIds: ReadonlySet<string>;
  customTriggerKeys: ReadonlySet<string>;
  customConditionKeys: ReadonlySet<string>;
  customActionKeys: ReadonlySet<string>;
};

function requireReference(
  values: string[],
  ids: ReadonlySet<string>,
  id: string,
  kind: string,
) {
  if (!ids.has(id))
    values.push(`Event references a ${kind} that does not exist`);
}

function variableType(
  reference: VariableReferenceV2,
  context: V2EventValidationContext,
): V2VariableType | undefined {
  if (reference.scope === "GLOBAL") {
    return context.globalVariables.get(reference.variableId);
  }
  if (reference.scope === "PLAYER") {
    return context.playerVariables.get(reference.variableId);
  }
  return context.sceneVariables
    .get(reference.sceneId)
    ?.get(reference.variableId);
}

function scalarType(value: boolean | number | string): V2VariableType {
  if (typeof value === "boolean") return "BOOLEAN";
  if (typeof value === "number") return "NUMBER";
  return "STRING";
}

function validateVariable(
  values: string[],
  reference: VariableReferenceV2,
  value: boolean | number | string | undefined,
  context: V2EventValidationContext,
) {
  const expected = variableType(reference, context);
  if (!expected) {
    values.push("Event references a variable outside its declared scope");
  } else if (value !== undefined && scalarType(value) !== expected) {
    values.push("Event variable value does not match its declared type");
  }
}

function validateComponent(
  values: string[],
  objectId: string,
  componentId: string,
  allowedType: V2ComponentType,
  context: V2EventValidationContext,
) {
  requireReference(values, context.objectIds, objectId, "object");
  const component = context.components.get(componentId);
  if (!component) {
    values.push("Event references a component that does not exist");
  } else if (
    component.objectId !== objectId ||
    component.type !== allowedType
  ) {
    values.push("Event component reference has the wrong owner or type");
  }
}

function validateObjectRole(
  values: string[],
  objectId: string,
  expected: V2ObjectType,
  context: V2EventValidationContext,
) {
  requireReference(values, context.objectIds, objectId, "object");
  if (context.objectTypes.get(objectId) !== expected) {
    values.push(`Event object reference must target a ${expected} object`);
  }
}

function validateCondition(
  condition: EventConditionV2,
  values: string[],
  ids: Set<string>,
  context: V2EventValidationContext,
) {
  if (ids.has(condition.id))
    values.push("Stable IDs must be unique within an event");
  ids.add(condition.id);
  switch (condition.type) {
    case "ALL":
    case "ANY":
      condition.conditions.forEach((child) =>
        validateCondition(child, values, ids, context),
      );
      break;
    case "NOT":
      validateCondition(condition.condition, values, ids, context);
      break;
    case "VARIABLE_COMPARE":
      validateVariable(values, condition.variable, condition.value, context);
      if (
        condition.operator !== "EQUALS" &&
        condition.operator !== "NOT_EQUALS" &&
        variableType(condition.variable, context) !== "NUMBER"
      ) {
        values.push("Ordered comparison requires a number variable");
      }
      break;
    case "ITEM_OWNED":
      validateObjectRole(values, condition.itemId, "ITEM", context);
      break;
    case "QUEST_STATE": {
      const component = context.components.get(condition.questComponentId);
      if (!component || component.type !== "Quest") {
        values.push("Event references a quest component of the wrong type");
      }
      break;
    }
    case "PLAYER_POSITION":
      requireReference(values, context.sceneIds, condition.sceneId, "scene");
      break;
    case "OBJECT_EXISTS":
      requireReference(values, context.objectIds, condition.objectId, "object");
      break;
    case "HAS_COMPONENT": {
      requireReference(values, context.objectIds, condition.objectId, "object");
      const component = context.components.get(condition.componentId);
      if (!component || component.objectId !== condition.objectId) {
        values.push("Event component reference has the wrong owner");
      }
      break;
    }
    case "CUSTOM":
      requireReference(
        values,
        context.customConditionKeys,
        condition.registryKey,
        "registered custom condition",
      );
      break;
    default:
      break;
  }
}

function validateStep(
  step: EventStepV2,
  values: string[],
  ids: Set<string>,
  context: V2EventValidationContext,
) {
  if (ids.has(step.id))
    values.push("Stable IDs must be unique within an event");
  ids.add(step.id);
  switch (step.type) {
    case "SHOW_DIALOGUE":
      validateComponent(
        values,
        step.objectId,
        step.componentId,
        "Dialogue",
        context,
      );
      break;
    case "CHANGE_SCENE":
      requireReference(values, context.sceneIds, step.sceneId, "scene");
      break;
    case "MOVE_OBJECT":
    case "DESTROY_OBJECT":
      requireReference(values, context.objectIds, step.objectId, "object");
      break;
    case "SHOW_UI":
    case "HIDE_UI":
      validateObjectRole(values, step.objectId, "UI", context);
      break;
    case "PLAY_ANIMATION":
      validateComponent(
        values,
        step.objectId,
        step.componentId,
        "Animator",
        context,
      );
      break;
    case "PLAY_AUDIO":
    case "STOP_AUDIO":
      requireReference(values, context.assetIds, step.assetId, "asset");
      break;
    case "ADD_ITEM":
    case "REMOVE_ITEM":
      validateObjectRole(values, step.itemId, "ITEM", context);
      break;
    case "CHANGE_VARIABLE": {
      validateVariable(values, step.variable, step.value, context);
      const type = variableType(step.variable, context);
      if (step.operation === "TOGGLE" && type !== "BOOLEAN") {
        values.push("TOGGLE requires a boolean variable");
      }
      if (
        (step.operation === "ADD" || step.operation === "SUBTRACT") &&
        type !== "NUMBER"
      ) {
        values.push("Arithmetic variable operations require a number variable");
      }
      break;
    }
    case "START_MINI_GAME":
      requireReference(
        values,
        context.moduleIds,
        step.moduleId,
        "mini-game module",
      );
      break;
    case "SPAWN_OBJECT":
      requireReference(values, context.prefabIds, step.prefabId, "prefab");
      requireReference(values, context.sceneIds, step.sceneId, "scene");
      break;
    case "RUN_SCRIPT":
      requireReference(values, context.scriptIds, step.scriptId, "script");
      break;
    case "CHANGE_HEALTH":
      validateComponent(
        values,
        step.objectId,
        step.componentId,
        "Health",
        context,
      );
      break;
    case "CUSTOM":
      requireReference(
        values,
        context.customActionKeys,
        step.registryKey,
        "registered custom action",
      );
      break;
    case "SEQUENCE":
    case "REPEAT":
      step.steps.forEach((child) => validateStep(child, values, ids, context));
      break;
    case "IF_ELSE":
      validateCondition(step.condition, values, ids, context);
      step.thenSteps.forEach((child) =>
        validateStep(child, values, ids, context),
      );
      step.elseSteps.forEach((child) =>
        validateStep(child, values, ids, context),
      );
      break;
    default:
      break;
  }
}

export function validateGameEventV2(
  event: GameEventV2,
  context: V2EventValidationContext,
): string[] {
  const diagnostics: string[] = [];
  const ids = new Set([event.id]);
  const trigger = event.trigger;
  switch (trigger.type) {
    case "ON_CLICK":
    case "ON_INTERACT":
      requireReference(
        diagnostics,
        context.objectIds,
        trigger.objectId,
        "object",
      );
      break;
    case "ON_COLLISION":
      requireReference(
        diagnostics,
        context.objectIds,
        trigger.firstObjectId,
        "object",
      );
      requireReference(
        diagnostics,
        context.objectIds,
        trigger.secondObjectId,
        "object",
      );
      break;
    case "ON_ENTER_AREA":
      validateObjectRole(diagnostics, trigger.areaObjectId, "TRIGGER", context);
      if (trigger.enteringObjectId)
        requireReference(
          diagnostics,
          context.objectIds,
          trigger.enteringObjectId,
          "object",
        );
      break;
    case "ON_EXIT_AREA":
      validateObjectRole(diagnostics, trigger.areaObjectId, "TRIGGER", context);
      if (trigger.exitingObjectId)
        requireReference(
          diagnostics,
          context.objectIds,
          trigger.exitingObjectId,
          "object",
        );
      break;
    case "ON_COLLECT_ITEM":
      validateObjectRole(diagnostics, trigger.itemObjectId, "ITEM", context);
      if (trigger.collectorObjectId)
        requireReference(
          diagnostics,
          context.objectIds,
          trigger.collectorObjectId,
          "object",
        );
      break;
    case "ON_VARIABLE_CHANGED":
      validateVariable(diagnostics, trigger.variable, undefined, context);
      break;
    case "ON_DIALOGUE_END":
    case "ON_CHOICE_SELECTED":
      validateComponent(
        diagnostics,
        trigger.objectId,
        trigger.componentId,
        "Dialogue",
        context,
      );
      if (trigger.type === "ON_CHOICE_SELECTED") {
        requireReference(
          diagnostics,
          context.dialogueChoiceIds,
          trigger.choiceId,
          "dialogue choice",
        );
        if (
          context.dialogueChoices.get(trigger.choiceId) !== trigger.componentId
        ) {
          diagnostics.push(
            "Dialogue choice does not belong to the referenced component",
          );
        }
      }
      break;
    case "CUSTOM":
      requireReference(
        diagnostics,
        context.customTriggerKeys,
        trigger.registryKey,
        "registered custom trigger",
      );
      break;
    default:
      break;
  }
  if (event.condition)
    validateCondition(event.condition, diagnostics, ids, context);
  event.steps.forEach((step) => validateStep(step, diagnostics, ids, context));
  return diagnostics;
}
