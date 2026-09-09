import {
  ApplyMutationBatchInput,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { createStudioId } from "./studio-provider";
import type { StudioMutation } from "./studio-state";

type Scene = EngineProjectV2Type["scenes"][number];
type GameObject = Scene["objects"][number];
type ComponentType = GameObject["components"][number]["type"];
type TransformChanges = Partial<
  Record<
    "x" | "y" | "width" | "height" | "rotation" | "scaleX" | "scaleY",
    number
  >
> & { pivot?: { x: number; y: number } };

// Roles are editable starting compositions; they impose no game-type lanes or
// additional canonical rules on the shared component instances.
const compositions: Record<GameObject["objectType"], readonly ComponentType[]> =
  {
    PLAYER: ["Transform", "SpriteRenderer", "Movement", "Collider", "Health"],
    NPC: ["Transform", "SpriteRenderer", "Dialogue", "Interactable"],
    ITEM: ["Transform", "SpriteRenderer", "InventoryItem"],
    TRIGGER: ["Transform", "Trigger", "Collider"],
    UI: ["Transform", "UIPanel"],
    DECORATION: ["Transform", "SpriteRenderer"],
    CUSTOM: ["Transform", "Custom"],
    TILEMAP: ["Transform", "Tilemap"],
    GROUP: ["Transform"],
  };

function command(value: StudioMutation): StudioMutation {
  return structuredClone(
    ApplyMutationBatchInput.shape.mutations.element.parse(value),
  );
}

export function createObjectCommand(
  scene: Scene,
  options: Pick<GameObject, "objectType" | "name" | "layerId"> & {
    parentId?: string | null;
    transform?: TransformChanges;
    renderOrder?: number;
  },
  newId: () => string = createStudioId,
): StudioMutation {
  const objectId = newId();
  const layerObjects = scene.objects.filter(
    (object) => object.layerId === options.layerId,
  );
  const order = Math.max(-1, ...layerObjects.map((object) => object.order)) + 1;
  const renderOrder =
    options.renderOrder ??
    Math.max(-1, ...layerObjects.map((object) => object.renderOrder)) + 1;
  const components = compositions[options.objectType].map((type) => {
    const definition = v2ComponentRegistry[type];
    const properties = definition.defaults() as Record<string, unknown>;
    if (type === "Transform") {
      if (options.objectType === "TILEMAP") properties.pivot = { x: 0, y: 0 };
      Object.assign(properties, options.transform);
    }
    if (type === "Movement" && options.objectType === "PLAYER")
      properties.controls = "PLAYER";
    if (type === "Collider" && options.objectType === "TRIGGER")
      properties.isTrigger = true;
    return { id: newId(), type, version: definition.version, properties };
  });
  return command({
    type: "object.create",
    sceneId: scene.id,
    objects: [
      {
        object: {
          id: objectId,
          name: options.name,
          objectType: options.objectType,
          parentId: options.parentId ?? null,
          layerId: options.layerId,
          enabled: true,
          visible: true,
          locked: false,
          order,
          renderOrder,
          components,
        },
        beforeObjectId: null,
      },
    ],
  });
}

export function updateObjectCommand(
  sceneId: string,
  objectId: string,
  changes: Extract<StudioMutation, { type: "object.update" }>["changes"],
): StudioMutation {
  return command({ type: "object.update", sceneId, objectId, changes });
}

export function reorderObjectsCommand(
  sceneId: string,
  layerId: string,
  objectIds: string[],
): StudioMutation {
  return command({
    type: "object.reorder",
    sceneId,
    layerId,
    orders: objectIds.map((id, order) => ({ id, order })),
  });
}

export function duplicateObjectCommand(
  sceneId: string,
  objectId: string,
  newId: string,
  name: string,
): StudioMutation {
  return command({ type: "object.duplicate", sceneId, objectId, newId, name });
}

/** Resolve ownership from the current scene before committing; no array indexes
 * or implicit descendant expansion can change the meaning of a recorded undo.
 */
export function deleteObjectCommand(
  scene: Scene,
  objectId: string,
  confirmed: true,
): StudioMutation {
  if (!scene.objects.some((object) => object.id === objectId))
    throw new Error("Object does not exist");
  const children = new Map<string, string[]>();
  for (const object of scene.objects) {
    if (!object.parentId) continue;
    const siblings = children.get(object.parentId) ?? [];
    siblings.push(object.id);
    children.set(object.parentId, siblings);
  }
  const ids = new Set<string>();
  const pending = [objectId];
  while (pending.length) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  return command({
    type: "object.delete",
    sceneId: scene.id,
    objectIds: scene.objects
      .filter((object) => ids.has(object.id))
      .map((object) => object.id),
    confirmed,
  });
}

export function addComponentCommand(
  sceneId: string,
  objectId: string,
  type: ComponentType,
  properties: unknown = v2ComponentRegistry[type].defaults(),
  newId: () => string = createStudioId,
): StudioMutation {
  return command({
    type: "component.add",
    sceneId,
    objectId,
    component: {
      id: newId(),
      type,
      version: v2ComponentRegistry[type].version,
      properties,
    },
    beforeComponentId: null,
  });
}

/** Replaces one component's complete properties, retaining its ID/type/version. */
export function updateComponentCommand(
  sceneId: string,
  objectId: string,
  componentId: string,
  properties: unknown,
): StudioMutation {
  if (properties === undefined)
    throw new Error("Component properties are required");
  return command({
    type: "component.update",
    sceneId,
    objectId,
    componentId,
    properties,
  });
}

export function removeComponentCommand(
  sceneId: string,
  objectId: string,
  componentId: string,
): StudioMutation {
  return command({ type: "component.remove", sceneId, objectId, componentId });
}
