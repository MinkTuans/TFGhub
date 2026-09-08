import { z } from 'zod';
import {
  COMPONENT_TYPES,
  componentRegistry,
  type ComponentType,
} from './component-registry.js';
import { StableId } from './stable-id.js';
import { EVENT_LIMITS, GameEventV1 } from './event-schema.js';
import { validateEventSemantics } from './validation.js';

export const ENGINE_PROJECT_SCHEMA_VERSION = 1 as const;

export const ENGINE_LIMITS = Object.freeze({
  assets: 1_000,
  scenes: 100,
  objectsPerScene: 1_000,
  componentsPerObject: 32,
  prefabs: 250,
  variablesPerScope: 500,
});

const orderedName = z.object({
  id: StableId,
  name: z.string().trim().min(1).max(80),
});

const ComponentInstance = z.object({
  id: StableId,
  type: z.enum(COMPONENT_TYPES),
  version: z.literal(1),
  properties: z.unknown().refine((value) => value !== undefined, {
    message: 'Component properties are required',
  }),
}).strict().superRefine((component, context) => {
  const definition = componentRegistry[component.type];
  const parsed = definition.schema.safeParse(component.properties);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: ['properties', ...issue.path],
      });
    }
  }
}).transform((component) => ({
  ...component,
  properties: componentRegistry[component.type].schema.parse(component.properties),
}));

const ObjectShape = orderedName.extend({
  parentId: StableId.nullable(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  components: z.array(ComponentInstance).max(ENGINE_LIMITS.componentsPerObject),
}).strict();

const SceneShape = orderedName.extend({
  order: z.number().int().nonnegative(),
  objects: z.array(ObjectShape).max(ENGINE_LIMITS.objectsPerScene),
}).strict();

const VariableDefinition = orderedName.extend({
  type: z.enum(['BOOLEAN', 'NUMBER', 'STRING']),
  initialValue: z.union([z.boolean(), z.number().finite(), z.string().max(2_000)]),
}).strict().superRefine((variable, context) => {
  const valid =
    (variable.type === 'BOOLEAN' && typeof variable.initialValue === 'boolean') ||
    (variable.type === 'NUMBER' && typeof variable.initialValue === 'number') ||
    (variable.type === 'STRING' && typeof variable.initialValue === 'string');
  if (!valid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Variable initial value must match its type',
      path: ['initialValue'],
    });
  }
});

const PrefabShape = orderedName.extend({
  components: z.array(ComponentInstance).max(ENGINE_LIMITS.componentsPerObject),
}).strict();

const ProjectShape = z.object({
  schemaVersion: z.literal(ENGINE_PROJECT_SCHEMA_VERSION),
  projectId: StableId,
  engineFamily: z.literal('TFG_ENGINE'),
  entrySceneId: StableId,
  settings: z.object({
    viewport: z.object({
      width: z.number().int().min(1).max(4096),
      height: z.number().int().min(1).max(4096),
    }).strict(),
  }).strict(),
  assetIds: z.array(StableId).max(ENGINE_LIMITS.assets),
  scenes: z.array(SceneShape).min(1).max(ENGINE_LIMITS.scenes),
  variables: z.object({
    global: z.array(VariableDefinition).max(ENGINE_LIMITS.variablesPerScope),
    player: z.array(VariableDefinition).max(ENGINE_LIMITS.variablesPerScope),
    scene: z.record(
      StableId,
      z.array(VariableDefinition).max(ENGINE_LIMITS.variablesPerScope),
    ),
  }).strict(),
  events: z.array(GameEventV1).max(EVENT_LIMITS.events),
  prefabs: z.array(PrefabShape).max(ENGINE_LIMITS.prefabs),
}).strict();

function duplicateIssue(
  ids: Set<string>,
  id: string,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (ids.has(id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Stable IDs must be unique within a project',
      path,
    });
  }
  ids.add(id);
}

export const EngineProjectV1 = ProjectShape.superRefine((project, context) => {
  const stableIds = new Set<string>();
  const assetIds = new Set<string>();
  const sceneIds = new Set<string>();
  const objectIds = new Set<string>();

  duplicateIssue(stableIds, project.projectId, context, ['projectId']);
  project.assetIds.forEach((id, index) => {
    duplicateIssue(stableIds, id, context, ['assetIds', index]);
    assetIds.add(id);
  });

  project.scenes.forEach((scene, sceneIndex) => {
    duplicateIssue(stableIds, scene.id, context, ['scenes', sceneIndex, 'id']);
    sceneIds.add(scene.id);
    scene.objects.forEach((object, objectIndex) => {
      duplicateIssue(
        stableIds,
        object.id,
        context,
        ['scenes', sceneIndex, 'objects', objectIndex, 'id'],
      );
      objectIds.add(object.id);
      object.components.forEach((component, componentIndex) => {
        duplicateIssue(
          stableIds,
          component.id,
          context,
          ['scenes', sceneIndex, 'objects', objectIndex, 'components', componentIndex, 'id'],
        );
        if (component.type === 'Dialogue') {
          const dialogue = component.properties as { choices: Array<{ id: string }> };
          dialogue.choices.forEach((choice, choiceIndex) => duplicateIssue(
            stableIds,
            choice.id,
            context,
            ['scenes', sceneIndex, 'objects', objectIndex, 'components', componentIndex, 'properties', 'choices', choiceIndex, 'id'],
          ));
        }
      });
    });
  });

  project.prefabs.forEach((prefab, prefabIndex) => {
    duplicateIssue(stableIds, prefab.id, context, ['prefabs', prefabIndex, 'id']);
    prefab.components.forEach((component, componentIndex) => {
      duplicateIssue(
        stableIds,
        component.id,
        context,
        ['prefabs', prefabIndex, 'components', componentIndex, 'id'],
      );
      if (component.type === 'Dialogue') {
        const dialogue = component.properties as { choices: Array<{ id: string }> };
        dialogue.choices.forEach((choice, choiceIndex) => duplicateIssue(
          stableIds,
          choice.id,
          context,
          ['prefabs', prefabIndex, 'components', componentIndex, 'properties', 'choices', choiceIndex, 'id'],
        ));
      }
    });
  });

  for (const [scope, variables] of [
    ['global', project.variables.global],
    ['player', project.variables.player],
  ] as const) {
    variables.forEach((variable, index) => {
      duplicateIssue(stableIds, variable.id, context, ['variables', scope, index, 'id']);
    });
  }
  for (const [sceneId, variables] of Object.entries(project.variables.scene)) {
    if (!sceneIds.has(sceneId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scene variable scope must reference an existing scene',
        path: ['variables', 'scene', sceneId],
      });
    }
    variables.forEach((variable, index) => {
      duplicateIssue(
        stableIds,
        variable.id,
        context,
        ['variables', 'scene', sceneId, index, 'id'],
      );
    });
  }

  if (!sceneIds.has(project.entrySceneId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Entry scene must reference an existing scene',
      path: ['entrySceneId'],
    });
  }

  project.scenes.forEach((scene, sceneIndex) => {
    const localObjects = new Map(scene.objects.map((object) => [object.id, object]));
    scene.objects.forEach((object, objectIndex) => {
      if (object.parentId && !localObjects.has(object.parentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Object parent must exist in the same scene',
          path: ['scenes', sceneIndex, 'objects', objectIndex, 'parentId'],
        });
      }
      const visited = new Set<string>([object.id]);
      let parentId = object.parentId;
      while (parentId) {
        if (visited.has(parentId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Object hierarchy must not contain a cycle',
            path: ['scenes', sceneIndex, 'objects', objectIndex, 'parentId'],
          });
          break;
        }
        visited.add(parentId);
        parentId = localObjects.get(parentId)?.parentId ?? null;
      }
    });
  });

  const componentContext = { assetIds, sceneIds, objectIds };
  const validateComponents = (
    components: Array<{ type: ComponentType; properties?: unknown }>,
    path: (string | number)[],
  ) => {
    components.forEach((component, index) => {
      if (!componentRegistry[component.type].schema.safeParse(component.properties).success) {
        return;
      }
      for (const message of componentRegistry[component.type].validateContext(
        component.properties,
        componentContext,
      )) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message,
          path: [...path, index, 'properties'],
        });
      }
    });
  };
  project.scenes.forEach((scene, sceneIndex) => {
    scene.objects.forEach((object, objectIndex) => {
      validateComponents(object.components, [
        'scenes',
        sceneIndex,
        'objects',
        objectIndex,
        'components',
      ]);
    });
  });
  project.prefabs.forEach((prefab, prefabIndex) => {
    validateComponents(prefab.components, ['prefabs', prefabIndex, 'components']);
  });

  validateEventSemantics(project, context, stableIds);
});

export type EngineProjectV1 = z.infer<typeof EngineProjectV1>;
