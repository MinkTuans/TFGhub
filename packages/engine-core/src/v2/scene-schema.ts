import { z } from "zod";
import { StableId } from "../stable-id.js";
import {
  V2_COMPONENT_TYPES,
  V2_LAYER_TYPES,
  v2ComponentRegistry,
  type V2ComponentType,
  type V2LayerType,
} from "./component-registry.js";

export const V2_SCENE_LIMITS = Object.freeze({
  layers: 100,
  objects: 1_000,
  componentsPerObject: 32,
  sceneSize: 65_536,
});

export const V2_SCENE_TYPES = [
  "MIXED",
  "MAP",
  "STORY",
  "MINI_GAME",
  "MENU",
] as const;

export const V2_OBJECT_TYPES = [
  "PLAYER",
  "NPC",
  "ITEM",
  "TRIGGER",
  "DECORATION",
  "UI",
  "TILEMAP",
  "GROUP",
  "CUSTOM",
] as const;

const finite = z.number().finite();

export const ComponentInstanceV2 = z
  .object({
    id: StableId,
    type: z.enum(V2_COMPONENT_TYPES),
    version: z.literal(1),
    properties: z.unknown().refine((value) => value !== undefined, {
      message: "Component properties are required",
    }),
  })
  .strict()
  .superRefine((component, context) => {
    const parsed = v2ComponentRegistry[component.type].schema.safeParse(
      component.properties,
    );
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) =>
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["properties", ...issue.path],
        }),
      );
    }
  })
  .transform((component) => ({
    ...component,
    properties: v2ComponentRegistry[component.type].schema.parse(
      component.properties,
    ),
  }));

export const LayerV2 = z
  .object({
    id: StableId,
    name: z.string().trim().min(1).max(80),
    order: z.number().int().nonnegative(),
    type: z.enum(V2_LAYER_TYPES),
    visible: z.boolean(),
    locked: z.boolean(),
  })
  .strict();

export const GameObjectV2 = z
  .object({
    id: StableId,
    name: z.string().trim().min(1).max(80),
    objectType: z.enum(V2_OBJECT_TYPES),
    parentId: StableId.nullable(),
    layerId: StableId,
    enabled: z.boolean(),
    visible: z.boolean(),
    locked: z.boolean(),
    order: z.number().int().nonnegative(),
    renderOrder: z.number().int(),
    components: z
      .array(ComponentInstanceV2)
      .max(V2_SCENE_LIMITS.componentsPerObject),
  })
  .strict();

const SceneShapeV2 = z
  .object({
    id: StableId,
    name: z.string().trim().min(1).max(80),
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    order: z.number().int().nonnegative(),
    type: z.enum(V2_SCENE_TYPES),
    width: z.number().int().positive().max(V2_SCENE_LIMITS.sceneSize),
    height: z.number().int().positive().max(V2_SCENE_LIMITS.sceneSize),
    background: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        assetId: StableId.nullable(),
      })
      .strict(),
    settings: z
      .object({
        gravityX: finite,
        gravityY: finite,
        grid: z
          .object({
            enabled: z.boolean(),
            size: z.number().int().positive().max(1_024),
            snap: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    layers: z.array(LayerV2).min(1).max(V2_SCENE_LIMITS.layers),
    objects: z.array(GameObjectV2).max(V2_SCENE_LIMITS.objects),
  })
  .strict();

function duplicateIssue(
  ids: Set<string>,
  id: string,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (ids.has(id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Stable IDs must be unique within a scene",
      path,
    });
  }
  ids.add(id);
}

function duplicateOrderIssue(
  orders: Set<number>,
  order: number,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (orders.has(order)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Order must be unique within its container",
      path,
    });
  }
  orders.add(order);
}

export const SceneV2 = SceneShapeV2.superRefine((scene, context) => {
  const ids = new Set<string>([scene.id]);
  const layerIds = new Set<string>();
  const layers = new Map<string, V2LayerType>();
  const layerOrders = new Set<number>();

  scene.layers.forEach((layer, index) => {
    duplicateIssue(ids, layer.id, context, ["layers", index, "id"]);
    duplicateOrderIssue(layerOrders, layer.order, context, [
      "layers",
      index,
      "order",
    ]);
    layerIds.add(layer.id);
    layers.set(layer.id, layer.type);
  });

  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const objectOrders = new Map<string, Set<number>>();
  scene.objects.forEach((object, objectIndex) => {
    duplicateIssue(ids, object.id, context, ["objects", objectIndex, "id"]);
    if (!layerIds.has(object.layerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Object layer must exist in the same scene",
        path: ["objects", objectIndex, "layerId"],
      });
    }
    const orders = objectOrders.get(object.layerId) ?? new Set<number>();
    duplicateOrderIssue(orders, object.order, context, [
      "objects",
      objectIndex,
      "order",
    ]);
    objectOrders.set(object.layerId, orders);

    const transformCount = object.components.filter(
      (component) => component.type === "Transform",
    ).length;
    if (transformCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every object must contain exactly one Transform component",
        path: ["objects", objectIndex, "components"],
      });
    }

    object.components.forEach((component, componentIndex) => {
      duplicateIssue(ids, component.id, context, [
        "objects",
        objectIndex,
        "components",
        componentIndex,
        "id",
      ]);
      const allowed = v2ComponentRegistry[component.type].allowedLayerTypes;
      const layerType = layers.get(object.layerId);
      if (allowed && layerType && !allowed.includes(layerType)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${component.type} is not compatible with a ${layerType} layer`,
          path: ["objects", objectIndex, "components", componentIndex, "type"],
        });
      }
      if (component.type === "Dialogue") {
        const dialogue = component.properties as {
          nodes: Array<{ id: string; choices: Array<{ id: string }> }>;
        };
        dialogue.nodes.forEach((node, nodeIndex) => {
          duplicateIssue(ids, node.id, context, [
            "objects",
            objectIndex,
            "components",
            componentIndex,
            "properties",
            "nodes",
            nodeIndex,
            "id",
          ]);
          node.choices.forEach((choice, choiceIndex) =>
            duplicateIssue(ids, choice.id, context, [
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
            ]),
          );
        });
      }
    });
  });

  scene.objects.forEach((object, objectIndex) => {
    if (object.parentId && !objects.has(object.parentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Object parent must exist in the same scene",
        path: ["objects", objectIndex, "parentId"],
      });
      return;
    }
    const visited = new Set<string>([object.id]);
    let parentId = object.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Object hierarchy must not contain a cycle",
          path: ["objects", objectIndex, "parentId"],
        });
        break;
      }
      visited.add(parentId);
      parentId = objects.get(parentId)?.parentId ?? null;
    }
  });
});

export type ComponentInstanceV2 = z.infer<typeof ComponentInstanceV2>;
export type LayerV2 = z.infer<typeof LayerV2>;
export type GameObjectV2 = z.infer<typeof GameObjectV2>;
export type SceneV2 = z.infer<typeof SceneV2>;
export type V2SceneType = (typeof V2_SCENE_TYPES)[number];
export type V2ObjectType = (typeof V2_OBJECT_TYPES)[number];
export type { V2ComponentType };
