import { z } from 'zod';
import type { ComponentType } from './component-registry.js';
import type { ConditionV1, EventActionV1, EventTriggerV1, GameEventV1, VariableReferenceV1 } from './event-schema.js';

type VariableType = 'BOOLEAN' | 'NUMBER' | 'STRING';
type SemanticProject = {
  assetIds: string[];
  scenes: Array<{
    id: string;
    objects: Array<{
      id: string;
      components: Array<{ id: string; type: ComponentType; properties: unknown }>;
    }>;
  }>;
  variables: {
    global: Array<{ id: string; type: VariableType }>;
    player: Array<{ id: string; type: VariableType }>;
    scene: Record<string, Array<{ id: string; type: VariableType }>>;
  };
  prefabs: Array<{ id: string }>;
  events: GameEventV1[];
};

type ComponentRecord = { objectId: string; type: ComponentType; properties: unknown };

function addIssue(context: z.RefinementCtx, message: string, path: (string | number)[]) {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

export function validateEventSemantics(
  project: SemanticProject,
  context: z.RefinementCtx,
  stableIds: Set<string>,
) {
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const objectIds = new Set<string>();
  const components = new Map<string, ComponentRecord>();
  for (const scene of project.scenes) {
    for (const object of scene.objects) {
      objectIds.add(object.id);
      object.components.forEach((component) => components.set(component.id, { objectId: object.id, ...component }));
    }
  }
  const assetIds = new Set(project.assetIds);
  const prefabIds = new Set(project.prefabs.map((prefab) => prefab.id));

  const ownComponent = (
    objectId: string,
    componentId: string,
    expected: ComponentType | undefined,
    path: (string | number)[],
  ) => {
    const component = components.get(componentId);
    if (!component || component.objectId !== objectId) {
      addIssue(context, 'Component must belong to the referenced object', path);
      return undefined;
    }
    if (expected && component.type !== expected) {
      addIssue(context, `Component must be of type ${expected}`, path);
      return undefined;
    }
    return component;
  };

  const variableType = (reference: VariableReferenceV1, path: (string | number)[]) => {
    const variables = reference.scope === 'GLOBAL'
      ? project.variables.global
      : reference.scope === 'PLAYER'
        ? project.variables.player
        : project.variables.scene[reference.sceneId];
    const variable = variables?.find((candidate) => candidate.id === reference.variableId);
    if (!variable) addIssue(context, 'Variable does not exist in the referenced scope', path);
    return variable?.type;
  };

  const validateValue = (reference: VariableReferenceV1, value: unknown, path: (string | number)[]) => {
    const expected = variableType(reference, [...path, 'variable']);
    const actual = typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? 'NUMBER' : 'STRING';
    if (expected && expected !== actual) addIssue(context, 'Variable value must match its declared type', [...path, 'value']);
    return expected;
  };

  const registerId = (id: string, path: (string | number)[]) => {
    if (stableIds.has(id)) addIssue(context, 'Stable IDs must be unique within a project', path);
    stableIds.add(id);
  };

  const validateTrigger = (trigger: EventTriggerV1, path: (string | number)[]) => {
    if (trigger.type === 'COLLISION') {
      if (!objectIds.has(trigger.firstObjectId)) addIssue(context, 'Collision object does not exist', [...path, 'firstObjectId']);
      if (!objectIds.has(trigger.secondObjectId)) addIssue(context, 'Collision object does not exist', [...path, 'secondObjectId']);
    } else if (trigger.type === 'CLICK' && !objectIds.has(trigger.objectId)) {
      addIssue(context, 'Clicked object does not exist', [...path, 'objectId']);
    } else if (trigger.type === 'DIALOGUE_END' || trigger.type === 'CHOICE_SELECTED') {
      const component = ownComponent(trigger.objectId, trigger.componentId, 'Dialogue', [...path, 'componentId']);
      if (trigger.type === 'CHOICE_SELECTED' && component) {
        const choices = (component.properties as { choices?: Array<{ id: string }> }).choices ?? [];
        if (!choices.some((choice) => choice.id === trigger.choiceId)) {
          addIssue(context, 'Dialogue choice does not exist', [...path, 'choiceId']);
        }
      }
    }
  };

  const validateCondition = (condition: ConditionV1, path: (string | number)[]) => {
    registerId(condition.id, [...path, 'id']);
    if (condition.type === 'ALL' || condition.type === 'ANY') {
      condition.conditions.forEach((child, index) => validateCondition(child, [...path, 'conditions', index]));
    } else if (condition.type === 'NOT') {
      validateCondition(condition.condition, [...path, 'condition']);
    } else if (condition.type === 'OBJECT_EXISTS') {
      if (!objectIds.has(condition.objectId)) addIssue(context, 'Condition object does not exist', [...path, 'objectId']);
    } else if (condition.type === 'HAS_COMPONENT') {
      ownComponent(condition.objectId, condition.componentId, undefined, [...path, 'componentId']);
    } else {
      const expected = validateValue(condition.variable, condition.value, path);
      if (expected && expected !== 'NUMBER' && !['EQUALS', 'NOT_EQUALS'].includes(condition.operator)) {
        addIssue(context, 'Ordered comparison requires a NUMBER variable', [...path, 'operator']);
      }
    }
  };

  const validateAction = (action: EventActionV1, path: (string | number)[]) => {
    registerId(action.id, [...path, 'id']);
    switch (action.type) {
      case 'CHANGE_SCENE':
        if (!sceneIds.has(action.sceneId)) addIssue(context, 'Action scene does not exist', [...path, 'sceneId']);
        break;
      case 'MOVE_OBJECT':
      case 'DESTROY_OBJECT':
        if (!objectIds.has(action.objectId)) addIssue(context, 'Action object does not exist', [...path, 'objectId']);
        break;
      case 'CREATE_OBJECT':
        if (!prefabIds.has(action.prefabId)) addIssue(context, 'Action prefab does not exist', [...path, 'prefabId']);
        if (!sceneIds.has(action.sceneId)) addIssue(context, 'Action scene does not exist', [...path, 'sceneId']);
        break;
      case 'PLAY_ANIMATION':
        ownComponent(action.objectId, action.componentId, 'Animation', [...path, 'componentId']);
        break;
      case 'PLAY_AUDIO':
        if (!assetIds.has(action.assetId)) addIssue(context, 'Action asset does not exist', [...path, 'assetId']);
        break;
      case 'CHANGE_VARIABLE':
        validateValue(action.variable, action.value, path);
        break;
      case 'CHANGE_HEALTH':
        ownComponent(action.objectId, action.componentId, 'Health', [...path, 'componentId']);
        break;
      case 'SHOW_DIALOGUE':
        ownComponent(action.objectId, action.componentId, 'Dialogue', [...path, 'componentId']);
        break;
      case 'ADD_SCORE':
        break;
    }
  };

  project.events.forEach((event, eventIndex) => {
    const path: (string | number)[] = ['events', eventIndex];
    registerId(event.id, [...path, 'id']);
    validateTrigger(event.trigger, [...path, 'trigger']);
    if (event.condition) validateCondition(event.condition, [...path, 'condition']);
    event.actions.forEach((action, actionIndex) => validateAction(action, [...path, 'actions', actionIndex]));
  });
}
