import { z } from "zod";
import { StableId } from "../stable-id.js";
import { EngineProjectV2 } from "./project-schema.js";
import {
  ComponentInstanceV2,
  GameObjectV2,
  LayerV2,
  SceneV2,
  V2_SCENE_LIMITS,
} from "./scene-schema.js";
import { uuidV5 } from "../adapters/identity.js";

const name = z.string().trim().min(1).max(80);
const order = z.number().int().nonnegative();
const orders = z
  .array(z.object({ id: StableId, order }).strict())
  .min(1)
  .max(100);
function definedChanges<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape, "strict">,
) {
  return schema.partial().superRefine((changes, context) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Update fields must not be undefined",
        });
    }
  });
}
const sceneChanges = definedChanges(
  SceneV2.innerType().omit({
    id: true,
    order: true,
    layers: true,
    objects: true,
  }),
);
const sceneVariables =
  EngineProjectV2.innerType().shape.variables.shape.scene.valueSchema;

export const PROJECT_MUTATION_BATCH_LIMIT = 100;
// A canonical scene plus 99 additions, followed by deletion in command 100.
// Create payloads carry atomic transitions, not independently valid documents.
// Peak checks below close these resource bounds under composed carrier replay.
const transitionLimits = {
  layers: V2_SCENE_LIMITS.layers + PROJECT_MUTATION_BATCH_LIMIT - 1,
  objects: V2_SCENE_LIMITS.objects * PROJECT_MUTATION_BATCH_LIMIT,
  components:
    V2_SCENE_LIMITS.componentsPerObject + PROJECT_MUTATION_BATCH_LIMIT - 1,
};
const transitionObject = GameObjectV2.extend({
  components: z.array(ComponentInstanceV2).max(transitionLimits.components),
});
const anchoredObjects = z
  .array(
    z
      .object({
        object: transitionObject,
        beforeObjectId: StableId.nullable(),
        beforeObjectLayerId: StableId.optional(),
      })
      .strict()
      .refine(
        (entry) =>
          entry.beforeObjectId !== null ||
          entry.beforeObjectLayerId === undefined,
        {
          message: "A layer-qualified anchor requires an object ID",
          path: ["beforeObjectLayerId"],
        },
      ),
  )
  .max(transitionLimits.objects);
const transitionScene = SceneV2.innerType().extend({
  layers: z.array(LayerV2).min(1).max(transitionLimits.layers),
  objects: z.array(transitionObject).max(transitionLimits.objects),
});

export const SceneMutation = z
  .object({
    type: z.literal("scene.rename"),
    sceneId: StableId,
    name,
  })
  .strict();

// Add command variants only alongside their reducer and authoring consumer.
export const ProjectMutation = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("asset.declare"),
      assetId: StableId,
      beforeAssetId: StableId.nullable().optional(),
    })
    .strict(),
  z.object({ type: z.literal("asset.forget"), assetId: StableId }).strict(),
  SceneMutation,
  z
    .object({
      type: z.literal("scene.create"),
      // Canonical cardinality and references are checked with the final project.
      scene: transitionScene,
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
      objects: anchoredObjects,
      beforeLayerId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("layer.update"),
      sceneId: StableId,
      layerId: StableId,
      changes: definedChanges(LayerV2.omit({ id: true, order: true })),
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
      // Inverse carriers remove only objects inserted by their create command.
      // Omission retains ordinary whole-layer deletion semantics.
      objectIds: z.array(StableId).max(transitionLimits.objects).optional(),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("object.create"),
      sceneId: StableId,
      objects: anchoredObjects.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("object.update"),
      sceneId: StableId,
      objectId: StableId,
      changes: definedChanges(
        GameObjectV2.omit({
          id: true,
          objectType: true,
          components: true,
        }),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("object.reorder"),
      sceneId: StableId,
      layerId: StableId,
      orders: orders.max(transitionLimits.objects),
    })
    .strict(),
  z
    .object({
      type: z.literal("object.duplicate"),
      sceneId: StableId,
      objectId: StableId,
      newId: StableId,
      name,
    })
    .strict(),
  z
    .object({
      type: z.literal("object.delete"),
      sceneId: StableId,
      // Exact ownership makes inverses safe even across forward parent references.
      objectIds: z.array(StableId).min(1).max(transitionLimits.objects),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("component.add"),
      sceneId: StableId,
      objectId: StableId,
      component: ComponentInstanceV2,
      beforeComponentId: StableId.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("component.update"),
      sceneId: StableId,
      objectId: StableId,
      componentId: StableId,
      properties: z
        .unknown()
        .refine(
          (value) => value !== undefined,
          "Component properties are required",
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal("component.remove"),
      sceneId: StableId,
      objectId: StableId,
      componentId: StableId,
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

// Restore in reverse anchor order, as with insert(), without quadratic scans
// and splices for large transitional snapshots. Existing duplicate IDs may be
// temporary: unqualified anchors keep first-match semantics. Layer restoration
// qualifies anchors so repeated cross-layer IDs cannot change physical order.
function insertObjects(
  scene: SceneV2,
  objects: z.infer<typeof anchoredObjects>,
  allowCrossLayerIds = false,
) {
  if (!objects.length) return;
  type Link = { value: GameObjectV2 | null; previous: Link; next: Link };
  const root = { value: null } as Link;
  root.previous = root.next = root;
  const byId = new Map<string, Link>();
  const key = (id: string, layerId?: string) =>
    layerId ? `${layerId}/${id}` : id;
  const add = (value: GameObjectV2, before: Link) => {
    const link = { value, previous: before.previous, next: before };
    before.previous.next = link;
    before.previous = link;
    if (!byId.has(value.id)) byId.set(value.id, link);
    const scoped = key(value.id, value.layerId);
    if (!byId.has(scoped)) byId.set(scoped, link);
  };
  scene.objects.forEach((object) => add(object, root));
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const { object, beforeObjectId, beforeObjectLayerId } = objects[index]!;
    // Only structural layer carriers may overlap ownership on another layer.
    // Same-layer IDs stay strict so the exact layer inverse cannot remove a survivor.
    if (
      byId.has(key(object.id, allowCrossLayerIds ? object.layerId : undefined))
    )
      throw new Error("Stable ID already exists");
    const anchor = beforeObjectId
      ? byId.get(key(beforeObjectId, beforeObjectLayerId))
      : root;
    if (!anchor) throw new ProjectMutationTargetError(beforeObjectId!);
    add(object, anchor);
  }
  scene.objects = [];
  for (let link = root.next; link !== root; link = link.next)
    scene.objects.push(link.value!);
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
    if (id !== rootId) ids.set(id, uuidV5(id, newId));
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

// Canonical ownership uses `id`, except projectId and the declared asset list.
// Non-Dialogue component properties and CUSTOM event config are opaque, not
// ownership. Reference fields never reserve an ID (including forward refs).
function* ownedIds(root: unknown): Generator<string> {
  const pending: unknown[] = [root];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      for (const child of value) pending.push(child);
    } else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string") yield record.id;
      for (const [key, child] of Object.entries(record)) {
        if (key === "properties" && record.type !== "Dialogue") continue;
        if (key === "config" && record.type === "CUSTOM") continue;
        if (child && typeof child === "object") pending.push(child);
      }
    }
  }
}

function assertFreshDuplicateIds(project: EngineProjectV2, copies: unknown) {
  const ids = new Set(ownedIds(project));
  ids.add(project.projectId);
  for (const id of project.assetIds) ids.add(id);
  for (const id of ownedIds(copies)) {
    if (ids.has(id)) throw new Error("Stable ID already exists");
    ids.add(id);
  }
}

// A layer restore must never need repeated owned IDs in the same layer. Keep
// this invariant from the first carrier/edit, not just when a snapshot replays.
// Missing layers are forward references and do not themselves own an ID yet.
function assertUniqueLayerOwnedIds(scene: SceneV2) {
  const layers = new Map<string, Set<string>>();
  for (const layer of scene.layers) {
    if (layers.has(layer.id))
      throw new Error("Same-layer stable IDs must be unique");
    layers.set(layer.id, new Set([layer.id]));
  }
  for (const object of scene.objects) {
    const ids = layers.get(object.layerId) ?? new Set<string>();
    layers.set(object.layerId, ids);
    for (const id of ownedIds(object)) {
      if (ids.has(id)) throw new Error("Same-layer stable IDs must be unique");
      ids.add(id);
    }
  }
}

function subtree(scene: SceneV2, rootId: string) {
  target(scene.objects, rootId);
  const children = new Map<string, string[]>();
  for (const object of scene.objects) {
    if (!object.parentId) continue;
    const siblings = children.get(object.parentId) ?? [];
    siblings.push(object.id);
    children.set(object.parentId, siblings);
  }
  const ids = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  return scene.objects.filter((object) => ids.has(object.id));
}

function duplicateObjects(
  scene: SceneV2,
  objectId: string,
  newId: string,
  name: string,
) {
  const originals = subtree(scene, objectId);
  const copies = copyObjects(originals, copyIds(objectId, newId, originals));
  const layerOrders = new Map<string, number>();
  for (const object of scene.objects)
    layerOrders.set(
      object.layerId,
      Math.max(layerOrders.get(object.layerId) ?? -1, object.order),
    );
  // Canonical ordering is independent of the array's storage order.
  for (const object of [...copies].sort(
    (left, right) => left.order - right.order,
  )) {
    object.order = (layerOrders.get(object.layerId) ?? -1) + 1;
    layerOrders.set(object.layerId, object.order);
    if (object.id === newId) object.name = name;
  }
  return copies;
}

function deletedLayerObjectIds(
  scene: SceneV2,
  command: Extract<ProjectMutation, { type: "layer.delete" }>,
) {
  const objects = scene.objects.filter(
    (object) => object.layerId === command.layerId,
  );
  if (command.objectIds === undefined)
    return new Set(objects.map((object) => object.id));
  const ids = new Set(command.objectIds);
  if (ids.size !== command.objectIds.length)
    throw new Error("Duplicate object ID");
  const owned = new Set(objects.map((object) => object.id));
  for (const id of ids)
    if (!owned.has(id)) throw new ProjectMutationTargetError(id);
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
      case "asset.declare":
        if (next.assetIds.includes(command.assetId))
          throw new Error("Asset is already declared");
        if (command.beforeAssetId) {
          const index = next.assetIds.indexOf(command.beforeAssetId);
          if (index < 0)
            throw new ProjectMutationTargetError(command.beforeAssetId);
          next.assetIds.splice(index, 0, command.assetId);
        } else next.assetIds.push(command.assetId);
        break;
      case "asset.forget":
        if (!next.assetIds.includes(command.assetId))
          throw new Error("Asset is not declared");
        next.assetIds = next.assetIds.filter((id) => id !== command.assetId);
        break;
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
        const copiedVariables = variables?.map((variable) => ({
          ...variable,
          id: ids.get(variable.id)!,
        }));
        assertFreshDuplicateIds(next, [copy, copiedVariables]);
        insert(next.scenes, copy, null);
        if (copiedVariables) next.variables.scene[copy.id] = copiedVariables;
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
        if (
          command.objects.some(
            ({ object }) => object.layerId !== command.layer.id,
          )
        )
          throw new Error("Restored object must belong to the created layer");
        insertObjects(scene, command.objects, true);
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
        const copy = {
          ...layer,
          id: command.newId,
          name: command.name,
          order: nextOrder(scene.layers),
        };
        const copiedObjects = copyObjects(objects, ids);
        assertFreshDuplicateIds(next, [copy, copiedObjects]);
        insert(scene.layers, copy, null);
        for (const object of copiedObjects) scene.objects.push(object);
        break;
      }
      case "layer.delete": {
        const scene = target(next.scenes, command.sceneId);
        target(scene.layers, command.layerId);
        if (scene.layers.length === 1)
          throw new Error("At least one layer is required");
        const ids = deletedLayerObjectIds(scene, command);
        scene.layers = scene.layers.filter(
          (layer) => layer.id !== command.layerId,
        );
        scene.objects = scene.objects.filter(
          (object) => object.layerId !== command.layerId || !ids.has(object.id),
        );
        break;
      }
      case "object.create":
        insertObjects(target(next.scenes, command.sceneId), command.objects);
        break;
      case "object.update":
        Object.assign(
          target(
            target(next.scenes, command.sceneId).objects,
            command.objectId,
          ),
          command.changes,
        );
        break;
      case "object.reorder": {
        const scene = target(next.scenes, command.sceneId);
        target(scene.layers, command.layerId);
        reorder(
          scene.objects.filter((object) => object.layerId === command.layerId),
          command.orders,
        );
        break;
      }
      case "object.duplicate": {
        const scene = target(next.scenes, command.sceneId);
        const copies = duplicateObjects(
          scene,
          command.objectId,
          command.newId,
          command.name,
        );
        assertFreshDuplicateIds(next, copies);
        // Avoid spread argument limits for bounded transitional scene carriers.
        for (const object of copies) scene.objects.push(object);
        break;
      }
      case "object.delete": {
        const scene = target(next.scenes, command.sceneId);
        const ids = new Set(command.objectIds);
        if (ids.size !== command.objectIds.length)
          throw new Error("Duplicate object ID");
        const existing = new Set<string>();
        for (const object of scene.objects) {
          if (ids.has(object.id) && existing.has(object.id))
            throw new Error("Ambiguous object ID");
          existing.add(object.id);
        }
        for (const id of ids)
          if (!existing.has(id)) throw new ProjectMutationTargetError(id);
        scene.objects = scene.objects.filter((object) => !ids.has(object.id));
        break;
      }
      case "component.add":
        insert(
          target(target(next.scenes, command.sceneId).objects, command.objectId)
            .components,
          command.component,
          command.beforeComponentId,
        );
        break;
      case "component.update": {
        const object = target(
          target(next.scenes, command.sceneId).objects,
          command.objectId,
        );
        const component = target(object.components, command.componentId);
        // Parse now so any later inverse snapshot carries valid property shapes.
        component.properties = ComponentInstanceV2.parse({
          ...component,
          properties: command.properties,
        }).properties;
        break;
      }
      case "component.remove": {
        const object = target(
          target(next.scenes, command.sceneId).objects,
          command.objectId,
        );
        target(object.components, command.componentId);
        object.components = object.components.filter(
          (component) => component.id !== command.componentId,
        );
        break;
      }
    }
    // Resource and local ownership safety for replayable transition carriers;
    // other semantics/references remain the final canonical validation's job.
    const touched =
      command.type === "scene.create"
        ? command.scene
        : "sceneId" in command
          ? next.scenes.find((scene) => scene.id === command.sceneId)
          : null;
    if (touched) {
      if (touched.layers.length > transitionLimits.layers)
        throw new Error("Atomic scene layers limit exceeded");
      if (touched.objects.length > transitionLimits.objects)
        throw new Error("Atomic scene objects limit exceeded");
      if (
        touched.objects.some(
          (object) => object.components.length > transitionLimits.components,
        )
      )
        throw new Error("Atomic object components limit exceeded");
      assertUniqueLayerOwnedIds(touched);
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
    case "asset.declare":
      return { type: "asset.forget", assetId: command.assetId };
    case "asset.forget":
      return {
        type: "asset.declare",
        assetId: command.assetId,
        beforeAssetId:
          before.assetIds[before.assetIds.indexOf(command.assetId) + 1] ?? null,
      };
    case "object.create":
      return {
        type: "object.delete",
        sceneId: command.sceneId,
        objectIds: command.objects.map(({ object }) => object.id),
        confirmed: true,
      };
    case "object.duplicate": {
      const objects = subtree(scene!, command.objectId);
      const ids = copyIds(command.objectId, command.newId, objects);
      return {
        type: "object.delete",
        sceneId: command.sceneId,
        objectIds: objects.map((object) => ids.get(object.id)!),
        confirmed: true,
      };
    }
    case "object.delete": {
      const ids = new Set(command.objectIds);
      return {
        type: "object.create",
        sceneId: command.sceneId,
        objects: scene!.objects.flatMap((object, index) => {
          if (!ids.has(object.id)) return [];
          const anchor = scene!.objects[index + 1];
          return [
            {
              object,
              beforeObjectId: anchor?.id ?? null,
              ...(anchor ? { beforeObjectLayerId: anchor.layerId } : {}),
            },
          ];
        }),
      };
    }
    case "object.update": {
      const object = target(scene!.objects, command.objectId);
      return {
        ...command,
        changes: Object.fromEntries(
          Object.keys(command.changes).map((key) => [
            key,
            object[key as keyof typeof command.changes],
          ]),
        ),
      };
    }
    case "object.reorder":
      return {
        ...command,
        orders: savedOrders(
          scene!.objects.filter((object) => object.layerId === command.layerId),
        ),
      };
    case "component.add":
      return {
        type: "component.remove",
        sceneId: command.sceneId,
        objectId: command.objectId,
        componentId: command.component.id,
      };
    case "component.update":
      return {
        ...command,
        properties: target(
          target(scene!.objects, command.objectId).components,
          command.componentId,
        ).properties,
      };
    case "component.remove": {
      const components = target(scene!.objects, command.objectId).components;
      return {
        type: "component.add",
        sceneId: command.sceneId,
        objectId: command.objectId,
        component: target(components, command.componentId),
        beforeComponentId: nextId(components, command.componentId),
      };
    }
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
        objectIds: command.objects.map(({ object }) => object.id),
        confirmed: true,
      };
    case "layer.duplicate": {
      const objects = scene!.objects.filter(
        (object) => object.layerId === command.layerId,
      );
      const ids = copyIds(command.layerId, command.newId, objects);
      return {
        type: "layer.delete",
        sceneId: command.sceneId,
        layerId: command.newId,
        objectIds: objects.map((object) => ids.get(object.id)!),
        confirmed: true,
      };
    }
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
    case "layer.delete": {
      const ids = deletedLayerObjectIds(scene!, command);
      return {
        type: "layer.create",
        sceneId: command.sceneId,
        layer: target(scene!.layers, command.layerId),
        beforeLayerId: nextId(scene!.layers, command.layerId),
        objects: scene!.objects.flatMap((object, index) => {
          if (object.layerId !== command.layerId || !ids.has(object.id))
            return [];
          const anchor = scene!.objects[index + 1];
          return [
            {
              object,
              beforeObjectId: anchor?.id ?? null,
              ...(anchor ? { beforeObjectLayerId: anchor.layerId } : {}),
            },
          ];
        }),
      };
    }
  }
}
