import { z } from "zod";
import { StableId } from "../stable-id.js";
import {
  V2_SCENE_LIMITS,
  ComponentInstanceV2,
  SceneV2,
  V2_OBJECT_TYPES,
  type ComponentInstanceV2 as ComponentInstanceV2Type,
  type V2ObjectType,
} from "./scene-schema.js";
import {
  V2_EVENT_LIMITS,
  GameEventV2,
  type EventConditionV2,
  type EventStepV2,
} from "./event-schema.js";
import {
  validateGameEventV2,
  type V2VariableType,
} from "./event-validation.js";
import {
  MiniGameDefinitionV2,
  validateMiniGameDefinitionV2,
} from "./module-schema.js";
import { ScriptResourceV2, validateScriptResourceV2 } from "./script-schema.js";
import {
  validateV2ComponentContext,
  type V2ComponentType,
  type V2LayerType,
} from "./component-registry.js";

export const ENGINE_PROJECT_V2_SCHEMA_VERSION = 2 as const;
export const ENGINE_V2_LIMITS = Object.freeze({
  assets: 1_000,
  scenes: 100,
  prefabs: 250,
  variablesPerScope: 500,
  modules: 500,
  scripts: 500,
});

const VariableDefinitionV2 = z
  .object({
    id: StableId,
    name: z.string().trim().min(1).max(80),
    type: z.enum(["BOOLEAN", "NUMBER", "STRING"]),
    initialValue: z.union([
      z.boolean(),
      z.number().finite(),
      z.string().max(2_000),
    ]),
  })
  .strict()
  .superRefine((variable, context) => {
    const valid =
      (variable.type === "BOOLEAN" &&
        typeof variable.initialValue === "boolean") ||
      (variable.type === "NUMBER" &&
        typeof variable.initialValue === "number") ||
      (variable.type === "STRING" && typeof variable.initialValue === "string");
    if (!valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Variable initial value must match its type",
        path: ["initialValue"],
      });
    }
  });

export const PrefabV2 = z
  .object({
    id: StableId,
    name: z.string().trim().min(1).max(80),
    objectType: z.enum(V2_OBJECT_TYPES),
    components: z
      .array(ComponentInstanceV2)
      .max(V2_SCENE_LIMITS.componentsPerObject),
  })
  .strict()
  .superRefine((prefab, context) => {
    const transforms = prefab.components.filter(
      (component) => component.type === "Transform",
    ).length;
    if (transforms !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every prefab must contain exactly one Transform component",
        path: ["components"],
      });
    }
  });

const ProjectShapeV2 = z
  .object({
    schemaVersion: z.literal(ENGINE_PROJECT_V2_SCHEMA_VERSION),
    projectId: StableId,
    engineFamily: z.literal("TFG_ENGINE"),
    entrySceneId: StableId,
    settings: z
      .object({
        viewport: z
          .object({
            width: z.number().int().positive().max(4_096),
            height: z.number().int().positive().max(4_096),
          })
          .strict(),
        pixelArt: z.boolean(),
      })
      .strict(),
    assetIds: z.array(StableId).max(ENGINE_V2_LIMITS.assets),
    scenes: z.array(SceneV2).min(1).max(ENGINE_V2_LIMITS.scenes),
    variables: z
      .object({
        global: z
          .array(VariableDefinitionV2)
          .max(ENGINE_V2_LIMITS.variablesPerScope),
        player: z
          .array(VariableDefinitionV2)
          .max(ENGINE_V2_LIMITS.variablesPerScope),
        scene: z.record(
          StableId,
          z.array(VariableDefinitionV2).max(ENGINE_V2_LIMITS.variablesPerScope),
        ),
      })
      .strict(),
    prefabs: z.array(PrefabV2).max(ENGINE_V2_LIMITS.prefabs),
    events: z.array(GameEventV2).max(V2_EVENT_LIMITS.events),
    modules: z.array(MiniGameDefinitionV2).max(ENGINE_V2_LIMITS.modules),
    scripts: z.array(ScriptResourceV2).max(ENGINE_V2_LIMITS.scripts),
  })
  .strict();

function addIssue(
  context: z.RefinementCtx,
  message: string,
  path: (string | number)[],
) {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

function addUniqueId(
  ids: Set<string>,
  id: string,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (ids.has(id)) {
    addIssue(context, "Stable IDs must be unique within a project", path);
  }
  ids.add(id);
}

function addConditionIds(
  condition: EventConditionV2,
  ids: Set<string>,
  conditionIds: Set<string>,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  addUniqueId(ids, condition.id, context, [...path, "id"]);
  conditionIds.add(condition.id);
  if (condition.type === "ALL" || condition.type === "ANY") {
    condition.conditions.forEach((child, index) =>
      addConditionIds(child, ids, conditionIds, context, [
        ...path,
        "conditions",
        index,
      ]),
    );
  } else if (condition.type === "NOT") {
    addConditionIds(condition.condition, ids, conditionIds, context, [
      ...path,
      "condition",
    ]);
  }
}

function addStepIds(
  step: EventStepV2,
  ids: Set<string>,
  conditionIds: Set<string>,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  addUniqueId(ids, step.id, context, [...path, "id"]);
  if (step.type === "SEQUENCE" || step.type === "REPEAT") {
    step.steps.forEach((child, index) =>
      addStepIds(child, ids, conditionIds, context, [...path, "steps", index]),
    );
  } else if (step.type === "IF_ELSE") {
    addConditionIds(step.condition, ids, conditionIds, context, [
      ...path,
      "condition",
    ]);
    step.thenSteps.forEach((child, index) =>
      addStepIds(child, ids, conditionIds, context, [
        ...path,
        "thenSteps",
        index,
      ]),
    );
    step.elseSteps.forEach((child, index) =>
      addStepIds(child, ids, conditionIds, context, [
        ...path,
        "elseSteps",
        index,
      ]),
    );
  }
}

function addModuleIds(
  module: z.infer<typeof MiniGameDefinitionV2>,
  ids: Set<string>,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  addUniqueId(ids, module.id, context, [...path, "id"]);
  if (module.type === "QUIZ") {
    module.config.questions.forEach((question, questionIndex) => {
      addUniqueId(ids, question.id, context, [
        ...path,
        "config",
        "questions",
        questionIndex,
        "id",
      ]);
      question.choices.forEach((choice, choiceIndex) =>
        addUniqueId(ids, choice.id, context, [
          ...path,
          "config",
          "questions",
          questionIndex,
          "choices",
          choiceIndex,
          "id",
        ]),
      );
    });
  } else if (module.type === "PUZZLE") {
    module.config.pieces.forEach((piece, index) =>
      addUniqueId(ids, piece.id, context, [
        ...path,
        "config",
        "pieces",
        index,
        "id",
      ]),
    );
  } else if (module.type === "MEMORY") {
    module.config.cards.forEach((card, index) =>
      addUniqueId(ids, card.id, context, [
        ...path,
        "config",
        "cards",
        index,
        "id",
      ]),
    );
  } else if (module.type === "DRAG_DROP") {
    module.config.items.forEach((item, index) =>
      addUniqueId(ids, item.id, context, [
        ...path,
        "config",
        "items",
        index,
        "id",
      ]),
    );
    module.config.targets.forEach((target, index) =>
      addUniqueId(ids, target.id, context, [
        ...path,
        "config",
        "targets",
        index,
        "id",
      ]),
    );
  }
}

export const EngineProjectV2 = ProjectShapeV2.superRefine(
  (project, context) => {
    const ids = new Set<string>();
    const assetIds = new Set<string>();
    const sceneIds = new Set<string>();
    const sceneKeys = new Set<string>();
    const sceneOrders = new Set<number>();
    const objectIds = new Set<string>();
    const objectTypes = new Map<string, V2ObjectType>();
    const layers = new Map<string, V2LayerType>();
    const components = new Map<
      string,
      { objectId: string; type: V2ComponentType }
    >();
    const dialogueChoiceIds = new Set<string>();
    const dialogueChoices = new Map<string, string>();
    const conditionIds = new Set<string>();
    const eventIds = new Set(project.events.map((event) => event.id));
    const prefabIds = new Set(project.prefabs.map((prefab) => prefab.id));
    const moduleIds = new Set(project.modules.map((module) => module.id));
    const scriptIds = new Set(project.scripts.map((script) => script.id));
    const globalVariables = new Map<string, V2VariableType>();
    const playerVariables = new Map<string, V2VariableType>();
    const sceneVariables = new Map<
      string,
      ReadonlyMap<string, V2VariableType>
    >();

    addUniqueId(ids, project.projectId, context, ["projectId"]);
    project.assetIds.forEach((id, index) => {
      addUniqueId(ids, id, context, ["assetIds", index]);
      assetIds.add(id);
    });

    project.scenes.forEach((scene, sceneIndex) => {
      addUniqueId(ids, scene.id, context, ["scenes", sceneIndex, "id"]);
      sceneIds.add(scene.id);
      if (sceneKeys.has(scene.key)) {
        addIssue(context, "Scene keys must be unique", [
          "scenes",
          sceneIndex,
          "key",
        ]);
      }
      sceneKeys.add(scene.key);
      if (sceneOrders.has(scene.order)) {
        addIssue(context, "Scene order must be unique", [
          "scenes",
          sceneIndex,
          "order",
        ]);
      }
      sceneOrders.add(scene.order);
      if (scene.background.assetId && !assetIds.has(scene.background.assetId)) {
        addIssue(
          context,
          "Scene background references an asset that is not declared by the project",
          ["scenes", sceneIndex, "background", "assetId"],
        );
      }
      scene.layers.forEach((layer, layerIndex) => {
        addUniqueId(ids, layer.id, context, [
          "scenes",
          sceneIndex,
          "layers",
          layerIndex,
          "id",
        ]);
        layers.set(layer.id, layer.type);
      });
      scene.objects.forEach((object, objectIndex) => {
        addUniqueId(ids, object.id, context, [
          "scenes",
          sceneIndex,
          "objects",
          objectIndex,
          "id",
        ]);
        objectIds.add(object.id);
        objectTypes.set(object.id, object.objectType);
        object.components.forEach((component, componentIndex) => {
          addUniqueId(ids, component.id, context, [
            "scenes",
            sceneIndex,
            "objects",
            objectIndex,
            "components",
            componentIndex,
            "id",
          ]);
          components.set(component.id, {
            objectId: object.id,
            type: component.type,
          });
          if (component.type === "Dialogue") {
            const dialogue = component.properties as {
              nodes: Array<{
                id: string;
                choices: Array<{ id: string }>;
              }>;
            };
            dialogue.nodes.forEach((node, nodeIndex) => {
              addUniqueId(ids, node.id, context, [
                "scenes",
                sceneIndex,
                "objects",
                objectIndex,
                "components",
                componentIndex,
                "properties",
                "nodes",
                nodeIndex,
                "id",
              ]);
              node.choices.forEach((choice, choiceIndex) => {
                addUniqueId(ids, choice.id, context, [
                  "scenes",
                  sceneIndex,
                  "objects",
                  objectIndex,
                  "components",
                  componentIndex,
                  "properties",
                  "nodes",
                  nodeIndex,
                  "choices",
                  choiceIndex,
                  "id",
                ]);
                dialogueChoiceIds.add(choice.id);
                dialogueChoices.set(choice.id, component.id);
              });
            });
          }
        });
      });
    });

    const addVariables = (
      variables: Array<z.infer<typeof VariableDefinitionV2>>,
      target: Map<string, V2VariableType>,
      path: (string | number)[],
    ) => {
      variables.forEach((variable, index) => {
        addUniqueId(ids, variable.id, context, [...path, index, "id"]);
        target.set(variable.id, variable.type);
      });
    };
    addVariables(project.variables.global, globalVariables, [
      "variables",
      "global",
    ]);
    addVariables(project.variables.player, playerVariables, [
      "variables",
      "player",
    ]);
    Object.entries(project.variables.scene).forEach(([sceneId, variables]) => {
      if (!sceneIds.has(sceneId)) {
        addIssue(
          context,
          "Scene variable scope must reference an existing scene",
          ["variables", "scene", sceneId],
        );
      }
      const target = new Map<string, V2VariableType>();
      addVariables(variables, target, ["variables", "scene", sceneId]);
      sceneVariables.set(sceneId, target);
    });

    project.prefabs.forEach((prefab, prefabIndex) => {
      addUniqueId(ids, prefab.id, context, ["prefabs", prefabIndex, "id"]);
      prefab.components.forEach((component, componentIndex) => {
        addUniqueId(ids, component.id, context, [
          "prefabs",
          prefabIndex,
          "components",
          componentIndex,
          "id",
        ]);
        if (component.type === "Dialogue") {
          const dialogue = component.properties as {
            nodes: Array<{
              id: string;
              choices: Array<{ id: string }>;
            }>;
          };
          dialogue.nodes.forEach((node, nodeIndex) => {
            addUniqueId(ids, node.id, context, [
              "prefabs",
              prefabIndex,
              "components",
              componentIndex,
              "properties",
              "nodes",
              nodeIndex,
              "id",
            ]);
            node.choices.forEach((choice, choiceIndex) =>
              addUniqueId(ids, choice.id, context, [
                "prefabs",
                prefabIndex,
                "components",
                componentIndex,
                "properties",
                "nodes",
                nodeIndex,
                "choices",
                choiceIndex,
                "id",
              ]),
            );
          });
        }
      });
    });

    const eventOrders = new Set<number>();
    project.events.forEach((event, eventIndex) => {
      addUniqueId(ids, event.id, context, ["events", eventIndex, "id"]);
      if (eventOrders.has(event.order)) {
        addIssue(context, "Event order must be unique", [
          "events",
          eventIndex,
          "order",
        ]);
      }
      eventOrders.add(event.order);
      if (event.condition) {
        addConditionIds(event.condition, ids, conditionIds, context, [
          "events",
          eventIndex,
          "condition",
        ]);
      }
      event.steps.forEach((step, stepIndex) =>
        addStepIds(step, ids, conditionIds, context, [
          "events",
          eventIndex,
          "steps",
          stepIndex,
        ]),
      );
    });
    project.modules.forEach((module, moduleIndex) =>
      addModuleIds(module, ids, context, ["modules", moduleIndex]),
    );
    project.scripts.forEach((script, scriptIndex) => {
      addUniqueId(ids, script.id, context, ["scripts", scriptIndex, "id"]);
      script.attachments.forEach((attachment, attachmentIndex) =>
        addUniqueId(ids, attachment.id, context, [
          "scripts",
          scriptIndex,
          "attachments",
          attachmentIndex,
          "id",
        ]),
      );
    });

    if (!sceneIds.has(project.entrySceneId)) {
      addIssue(context, "Entry scene must reference an existing scene", [
        "entrySceneId",
      ]);
    }

    const componentContext = {
      assetIds,
      sceneIds,
      objectIds,
      layers,
      eventIds,
      conditionIds,
      globalVariableIds: new Set(globalVariables.keys()),
      playerVariableIds: new Set(playerVariables.keys()),
      sceneVariableIds: new Map(
        [...sceneVariables].map(([sceneId, variables]) => [
          sceneId,
          new Set(variables.keys()),
        ]),
      ),
      scriptIds,
      moduleIds,
    };
    const validateComponents = (
      componentList: ComponentInstanceV2Type[],
      path: (string | number)[],
      validationContext: typeof componentContext,
    ) => {
      componentList.forEach((component, index) => {
        validateV2ComponentContext(
          component.type,
          component.properties,
          validationContext,
        ).forEach((message) =>
          addIssue(context, message, [...path, index, "properties"]),
        );
      });
    };
    project.scenes.forEach((scene, sceneIndex) => {
      const sceneContext = {
        ...componentContext,
        objectIds: new Set(scene.objects.map((object) => object.id)),
        layers: new Map(scene.layers.map((layer) => [layer.id, layer.type])),
      };
      scene.objects.forEach((object, objectIndex) =>
        validateComponents(
          object.components,
          ["scenes", sceneIndex, "objects", objectIndex, "components"],
          sceneContext,
        ),
      );
    });
    const prefabContext = {
      ...componentContext,
      objectIds: new Set<string>(),
      layers: new Map<string, V2LayerType>(),
    };
    project.prefabs.forEach((prefab, prefabIndex) =>
      validateComponents(
        prefab.components,
        ["prefabs", prefabIndex, "components"],
        prefabContext,
      ),
    );

    const eventContext = {
      sceneIds,
      objectIds,
      objectTypes,
      components,
      assetIds,
      prefabIds,
      globalVariables,
      playerVariables,
      sceneVariables,
      dialogueChoiceIds,
      dialogueChoices,
      scriptIds,
      moduleIds,
      customTriggerKeys: new Set<string>(),
      customConditionKeys: new Set<string>(),
      customActionKeys: new Set<string>(),
    };
    project.events.forEach((event, eventIndex) =>
      validateGameEventV2(event, eventContext).forEach((message) =>
        addIssue(context, message, ["events", eventIndex]),
      ),
    );

    const miniGameContext = {
      assetIds,
      itemObjectIds: new Set(
        [...objectTypes]
          .filter(([, type]) => type === "ITEM")
          .map(([id]) => id),
      ),
      globalVariables,
      playerVariables,
      sceneVariables,
    };
    project.modules.forEach((module, moduleIndex) =>
      validateMiniGameDefinitionV2(module, miniGameContext).forEach((message) =>
        addIssue(context, message, ["modules", moduleIndex]),
      ),
    );
    project.scripts.forEach((script, scriptIndex) =>
      validateScriptResourceV2(script, {
        sceneIds,
        objectIds,
        eventIds,
      }).forEach((message) =>
        addIssue(context, message, ["scripts", scriptIndex]),
      ),
    );
  },
);

export type EngineProjectV2 = z.infer<typeof EngineProjectV2>;
export type PrefabV2 = z.infer<typeof PrefabV2>;
