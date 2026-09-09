import { z } from "zod";
import { StableId } from "../stable-id.js";
import { EngineProjectV2 } from "./project-schema.js";
import { GameObjectV2, LayerV2, SceneV2 } from "./scene-schema.js";
import { uuidV5 } from "../adapters/identity.js";

const name = z.string().trim().min(1).max(80);
const order = z.number().int().nonnegative();
const orders = z
  .array(z.object({ id: StableId, order }).strict())
  .min(1)
  .max(100);
const sceneChanges = SceneV2.innerType()
  .omit({ id: true, order: true, layers: true, objects: true })
  .partial();
const sceneVariables =
  EngineProjectV2.innerType().shape.variables.shape.scene.valueSchema;

export const SceneMutation = z
  .object({
    type: z.literal("scene.rename"),
    sceneId: StableId,
    name,
  })
  .strict();

// Add command variants only alongside their reducer and authoring consumer.
export const ProjectMutation = z.discriminatedUnion("type", [
  SceneMutation,
  z
    .object({
      type: z.literal("scene.create"),
      // Scene-local references are checked with the final project. An inverse
      // may restore the scene before a later command restores its parent layer.
      scene: SceneV2.innerType(),
      variables: sceneVariables.nullable(),
      beforeSceneId: StableId.nullable(),
      entry: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.update"),
      sceneId: StableId,
      changes: sceneChanges,
    })
    .strict(),
  z.object({ type: z.literal("scene.entry"), sceneId: StableId }).strict(),
  z.object({ type: z.literal("scene.reorder"), orders }).strict(),
  z
    .object({
      type: z.literal("scene.duplicate"),
      sceneId: StableId,
      newId: StableId,
      name,
      key: SceneV2.innerType().shape.key,
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.delete"),
      sceneId: StableId,
      replacementSceneId: StableId.nullable(),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("layer.create"),
      sceneId: StableId,
      layer: LayerV2,
      objects: z
        .array(
          z
            .object({
              object: GameObjectV2,
              beforeObjectId: StableId.nullable(),
            })
            .strict(),
        )
        .max(1_000),
      beforeLayerId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("layer.update"),
      sceneId: StableId,
      layerId: StableId,
      changes: LayerV2.omit({ id: true, order: true }).partial(),
    })
    .strict(),
  z
    .object({ type: z.literal("layer.reorder"), sceneId: StableId, orders })
    .strict(),
  z
    .object({
      type: z.literal("layer.duplicate"),
      sceneId: StableId,
      layerId: StableId,
      newId: StableId,
      name,
    })
    .strict(),
  z
    .object({
      type: z.literal("layer.delete"),
      sceneId: StableId,
      layerId: StableId,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export type SceneMutation = z.infer<typeof SceneMutation>;
export type ProjectMutation = z.infer<typeof ProjectMutation>;

export class ProjectMutationTargetError extends Error {
  constructor(readonly targetId: string) {
    super(`Mutation target does not exist: ${targetId}`);
  }
}

function target<T extends { id: string }>(values: T[], id: string): T {
  const value = values.find((value) => value.id === id);
  if (!value) throw new ProjectMutationTargetError(id);
  return value;
}

function insert<T extends { id: string }>(
  values: T[],
  value: T,
  beforeId: string | null,
) {
  if (values.some((item) => item.id === value.id))
    throw new Error("Stable ID already exists");
  if (beforeId) target(values, beforeId);
  values.splice(
    beforeId ? values.findIndex((item) => item.id === beforeId) : values.length,
    0,
    value,
  );
}

function reorder(
  values: Array<{ id: string; order: number }>,
  updates: Array<{ id: string; order: number }>,
) {
  const byId = new Map(updates.map((value) => [value.id, value.order]));
  if (
    byId.size !== values.length ||
    updates.length !== values.length ||
    values.some((value) => !byId.has(value.id))
  )
    throw new Error("Reorder must include every current ID exactly once");
  values.forEach((value) => {
    value.order = byId.get(value.id)!;
  });
}

const nextOrder = (values: Array<{ order: number }>) =>
  Math.max(-1, ...values.map((value) => value.order)) + 1;

/** Ownership is structural: project-wide events/modules/scripts/prefabs remain shared.
 * Only declared references are remapped. Custom config (including preserved V1
 * components), names, text, and script source are opaque canonical data.
 */
function copyObjects(objects: GameObjectV2[], ids: Map<string, string>) {
  const ref = (id: string) => ids.get(id) ?? id;
  return objects.map((original) => {
    const object = structuredClone(original);
    object.id = ref(object.id);
    object.layerId = ref(object.layerId);
    if (object.parentId) object.parentId = ref(object.parentId);
    object.components.forEach((component) => {
      component.id = ref(component.id);
      // All property shapes below are already checked by EngineProjectV2.
      const properties = component.properties as Record<string, unknown>;
      if (
        component.type === "Collider" &&
        typeof properties.collisionLayerId === "string"
      )
        properties.collisionLayerId = ref(properties.collisionLayerId);
      if (
        component.type === "Camera" &&
        typeof properties.followObjectId === "string"
      )
        properties.followObjectId = ref(properties.followObjectId);
      if (
        component.type === "MiniGame" &&
        typeof properties.returnSceneId === "string"
      )
        properties.returnSceneId = ref(properties.returnSceneId);
      if (["Text", "UIImage", "UIButton", "UIPanel"].includes(component.type)) {
        const variable = properties.visibilityVariable as {
          scope: string;
          sceneId?: string;
          variableId: string;
        } | null;
        if (variable?.scope === "SCENE") {
          variable.sceneId = ref(variable.sceneId!);
          variable.variableId = ref(variable.variableId);
        }
      }
      if (component.type === "Dialogue") {
        const dialogue = properties as {
          startNodeId: string | null;
          nodes: Array<{ id: string; choices: Array<{ id: string }> }>;
        };
        if (dialogue.startNodeId)
          dialogue.startNodeId = ref(dialogue.startNodeId);
        dialogue.nodes.forEach((node) => {
          node.id = ref(node.id);
          node.choices.forEach((choice) => {
            choice.id = ref(choice.id);
          });
        });
      }
    });
    return object;
  });
}

function copyIds(
  rootId: string,
  newId: string,
  objects: GameObjectV2[],
  extraIds: string[] = [],
) {
  const ids = new Map([[rootId, newId]]);
  const add = (id: string) => {
    ids.set(id, uuidV5(id, newId));
  };
  extraIds.forEach(add);
  objects.forEach((object) => {
    add(object.id);
    object.components.forEach((component) => {
      add(component.id);
      if (component.type === "Dialogue") {
        const dialogue = component.properties as {
          nodes: Array<{ id: string; choices: Array<{ id: string }> }>;
        };
        dialogue.nodes.forEach((node) => {
          add(node.id);
          node.choices.forEach((choice) => add(choice.id));
        });
      }
    });
  });
  return ids;
}

/** Applies an ordered batch to a detached document, or throws without changing either input. */
function applyBatch(
  project: EngineProjectV2,
  mutations: ProjectMutation[],
  withHistory: boolean,
) {
  // Zod's unknown Custom config values can retain nested input references.
  const next = structuredClone(EngineProjectV2.parse(project));
  const commands = structuredClone(z.array(ProjectMutation).parse(mutations));
  const redo = withHistory ? structuredClone(commands) : commands;
  const undo: ProjectMutation[] = [];
  for (const command of commands) {
    if (withHistory) undo.unshift(structuredClone(inverse(next, command)));
    switch (command.type) {
      case "scene.rename": {
        const scene = target(next.scenes, command.sceneId);
        scene.name = command.name;
        break;
      }
      case "scene.create":
        insert(next.scenes, command.scene, command.beforeSceneId);
        if (command.variables !== null)
          next.variables.scene[command.scene.id] = command.variables;
        if (command.entry) next.entrySceneId = command.scene.id;
        break;
      case "scene.update":
        Object.assign(target(next.scenes, command.sceneId), command.changes);
        break;
      case "scene.entry":
        target(next.scenes, command.sceneId);
        next.entrySceneId = command.sceneId;
        break;
      case "scene.reorder":
        reorder(next.scenes, command.orders);
        break;
      case "scene.duplicate": {
        const scene = target(next.scenes, command.sceneId);
        const variables = next.variables.scene[scene.id];
        const ids = copyIds(scene.id, command.newId, scene.objects, [
          ...scene.layers.map((layer) => layer.id),
          ...(variables ?? []).map((variable) => variable.id),
        ]);
        const copy = structuredClone(scene);
        Object.assign(copy, {
          id: command.newId,
          name: command.name,
          key: command.key,
          order: nextOrder(next.scenes),
        });
        copy.layers.forEach((layer) => {
          layer.id = ids.get(layer.id)!;
        });
        copy.objects = copyObjects(scene.objects, ids);
        insert(next.scenes, copy, null);
        if (variables)
          next.variables.scene[copy.id] = variables.map((variable) => ({
            ...variable,
            id: ids.get(variable.id)!,
          }));
        break;
      }
      case "scene.delete":
        target(next.scenes, command.sceneId);
        if (next.scenes.length === 1)
          throw new Error("At least one scene is required");
        if (next.entrySceneId === command.sceneId) {
          if (
            !command.replacementSceneId ||
            command.replacementSceneId === command.sceneId
          )
            throw new Error(
              "Deleting the entry scene requires another entry scene",
            );
          target(next.scenes, command.replacementSceneId);
          next.entrySceneId = command.replacementSceneId;
        } else if (command.replacementSceneId !== null)
          throw new Error(
            "Only entry scene deletion can reassign the entry scene",
          );
        next.scenes = next.scenes.filter(
          (scene) => scene.id !== command.sceneId,
        );
        delete next.variables.scene[command.sceneId];
        break;
      case "layer.create": {
        const scene = target(next.scenes, command.sceneId);
        insert(scene.layers, command.layer, command.beforeLayerId);
        // Reverse restores even adjacent removed objects using stable anchors.
        for (const { object, beforeObjectId } of [
          ...command.objects,
        ].reverse()) {
          if (object.layerId !== command.layer.id)
            throw new Error("Restored object must belong to the created layer");
          insert(scene.objects, object, beforeObjectId);
        }
        break;
      }
      case "layer.update":
        Object.assign(
          target(target(next.scenes, command.sceneId).layers, command.layerId),
          command.changes,
        );
        break;
      case "layer.reorder":
        reorder(target(next.scenes, command.sceneId).layers, command.orders);
        break;
      case "layer.duplicate": {
        const scene = target(next.scenes, command.sceneId);
        const layer = target(scene.layers, command.layerId);
        const objects = scene.objects.filter(
          (object) => object.layerId === layer.id,
        );
        const ids = copyIds(layer.id, command.newId, objects);
        insert(
          scene.layers,
          {
            ...layer,
            id: command.newId,
            name: command.name,
            order: nextOrder(scene.layers),
          },
          null,
        );
        scene.objects.push(...copyObjects(objects, ids));
        break;
      }
      case "layer.delete": {
        const scene = target(next.scenes, command.sceneId);
        target(scene.layers, command.layerId);
        if (scene.layers.length === 1)
          throw new Error("At least one layer is required");
        scene.layers = scene.layers.filter(
          (layer) => layer.id !== command.layerId,
        );
        scene.objects = scene.objects.filter(
          (object) => object.layerId !== command.layerId,
        );
        break;
      }
    }
  }
  return { document: EngineProjectV2.parse(next), undo, redo };
}

export function applyProjectMutations(
  project: EngineProjectV2,
  mutations: ProjectMutation[],
): EngineProjectV2 {
  return applyBatch(project, mutations, false).document;
}

/** Same atomic validation boundary as API writes; no unchecked transition escapes. */
export function applyProjectMutationsWithHistory(
  project: EngineProjectV2,
  mutations: ProjectMutation[],
) {
  return applyBatch(project, mutations, true);
}

const nextId = <T extends { id: string }>(values: T[], id: string) =>
  values[values.findIndex((value) => value.id === id) + 1]?.id ?? null;
const savedOrders = (values: Array<{ id: string; order: number }>) =>
  values.map(({ id, order }) => ({ id, order }));

// Ordinary inverses carry changed fields. Only removed ownership is snapshotted.
function inverse(
  before: EngineProjectV2,
  command: ProjectMutation,
): ProjectMutation {
  const scene =
    "sceneId" in command ? target(before.scenes, command.sceneId) : null;
  switch (command.type) {
    case "scene.rename":
      return { ...command, name: scene!.name };
    case "scene.update":
      return {
        ...command,
        changes: Object.fromEntries(
          Object.keys(command.changes).map((key) => [
            key,
            scene![key as keyof typeof command.changes],
          ]),
        ),
      };
    case "scene.entry":
      return { ...command, sceneId: before.entrySceneId };
    case "scene.reorder":
      return { ...command, orders: savedOrders(before.scenes) };
    case "scene.create":
      return {
        type: "scene.delete",
        sceneId: command.scene.id,
        replacementSceneId: command.entry ? before.entrySceneId : null,
        confirmed: true,
      };
    case "scene.duplicate":
      return {
        type: "scene.delete",
        sceneId: command.newId,
        replacementSceneId: null,
        confirmed: true,
      };
    case "scene.delete":
      return {
        type: "scene.create",
        scene: scene!,
        variables: before.variables.scene[command.sceneId] ?? null,
        beforeSceneId: nextId(before.scenes, command.sceneId),
        entry: before.entrySceneId === command.sceneId,
      };
    case "layer.create":
      return {
        type: "layer.delete",
        sceneId: command.sceneId,
        layerId: command.layer.id,
        confirmed: true,
      };
    case "layer.duplicate":
      return {
        type: "layer.delete",
        sceneId: command.sceneId,
        layerId: command.newId,
        confirmed: true,
      };
    case "layer.reorder":
      return { ...command, orders: savedOrders(scene!.layers) };
    case "layer.update": {
      const layer = target(scene!.layers, command.layerId);
      return {
        ...command,
        changes: Object.fromEntries(
          Object.keys(command.changes).map((key) => [
            key,
            layer[key as keyof typeof command.changes],
          ]),
        ),
      };
    }
    case "layer.delete":
      return {
        type: "layer.create",
        sceneId: command.sceneId,
        layer: target(scene!.layers, command.layerId),
        beforeLayerId: nextId(scene!.layers, command.layerId),
        objects: scene!.objects
          .filter((object) => object.layerId === command.layerId)
          .map((object) => ({
            object,
            beforeObjectId: nextId(scene!.objects, object.id),
          })),
      };
  }
}
