import { z } from "zod";
import { StableId } from "../stable-id.js";

const finite = z.number().finite();
export const V2_GEOMETRY_LIMITS = Object.freeze({
  coordinate: 1_000_000,
  extent: 65_536,
  rotation: 360_000,
  scale: 1_000,
});
const coordinate = finite
  .min(-V2_GEOMETRY_LIMITS.coordinate)
  .max(V2_GEOMETRY_LIMITS.coordinate);
const extent = finite.positive().max(V2_GEOMETRY_LIMITS.extent);
const scale = finite
  .min(-V2_GEOMETRY_LIMITS.scale)
  .max(V2_GEOMETRY_LIMITS.scale)
  .refine((value) => value !== 0, "Scale must not be zero");
const rotation = finite
  .min(-V2_GEOMETRY_LIMITS.rotation)
  .max(V2_GEOMETRY_LIMITS.rotation);
const nonNegative = finite.nonnegative();
const positive = finite.positive();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const boundedName = z.string().trim().min(1).max(120);
const nullableId = StableId.nullable();

const SafeJsonObject = z.record(z.unknown()).superRefine((root, context) => {
  const seen = new WeakSet<object>();
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ];
  let entries = 0;

  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) continue;
    if (typeof value !== "object" || depth > 8 || seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom component config must be bounded acyclic JSON",
      });
      return;
    }

    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom component config must be bounded acyclic JSON",
        });
        return;
      }
    }

    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    if (children.length > 1_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom component config exceeds its collection limit",
      });
      return;
    }
    entries += children.length;
    if (entries > 10_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom component config exceeds its total entry limit",
      });
      return;
    }
    children.forEach((child) =>
      pending.push({ value: child, depth: depth + 1 }),
    );
  }
});

export const V2_LAYER_TYPES = ["WORLD", "UI", "COLLISION"] as const;
export type V2LayerType = (typeof V2_LAYER_TYPES)[number];

export const V2_COMPONENT_TYPES = [
  "Transform",
  "SpriteRenderer",
  "Collider",
  "Animator",
  "Movement",
  "Health",
  "Dialogue",
  "Interactable",
  "InventoryItem",
  "Trigger",
  "AudioSource",
  "Quest",
  "Script",
  "Text",
  "UIImage",
  "UIButton",
  "UIPanel",
  "Camera",
  "Tilemap",
  "SpawnPoint",
  "MiniGame",
  "Custom",
] as const;

export type V2ComponentType = (typeof V2_COMPONENT_TYPES)[number];

export type V2ComponentContext = {
  assetIds: ReadonlySet<string>;
  sceneIds: ReadonlySet<string>;
  objectIds: ReadonlySet<string>;
  layers: ReadonlyMap<string, V2LayerType>;
  eventIds: ReadonlySet<string>;
  conditionIds: ReadonlySet<string>;
  globalVariableIds: ReadonlySet<string>;
  playerVariableIds: ReadonlySet<string>;
  sceneVariableIds: ReadonlyMap<string, ReadonlySet<string>>;
  scriptIds: ReadonlySet<string>;
  moduleIds: ReadonlySet<string>;
};

export type V2ComponentDefinition = {
  version: 1;
  defaults: () => unknown;
  schema: z.ZodTypeAny;
  validateContext: (
    properties: unknown,
    context: V2ComponentContext,
  ) => string[];
  runtimeHandlerKey: string;
  migrations: Readonly<Record<number, (value: unknown) => unknown>>;
  allowedLayerTypes?: readonly V2LayerType[];
};

function definition(
  type: string,
  schema: z.ZodTypeAny,
  defaults: () => unknown,
  options: {
    validateContext?: V2ComponentDefinition["validateContext"];
    allowedLayerTypes?: readonly V2LayerType[];
  } = {},
): V2ComponentDefinition {
  return {
    version: 1,
    schema,
    defaults,
    validateContext: options.validateContext ?? (() => []),
    runtimeHandlerKey: `tfg.v2.${type.replace(
      /[A-Z]/g,
      (letter, offset) => `${offset === 0 ? "" : "-"}${letter.toLowerCase()}`,
    )}.v1`,
    migrations: {},
    ...(options.allowedLayerTypes
      ? { allowedLayerTypes: options.allowedLayerTypes }
      : {}),
  };
}

function missingReference(
  id: unknown,
  ids: { has(id: string): boolean },
  message: string,
): string[] {
  return typeof id === "string" && !ids.has(id) ? [message] : [];
}

function missingReferences(
  values: unknown,
  ids: ReadonlySet<string>,
  message: string,
): string[] {
  if (!Array.isArray(values)) return [];
  return values.some((value) => typeof value === "string" && !ids.has(value))
    ? [message]
    : [];
}

const Transform = z
  .object({
    x: coordinate,
    y: coordinate,
    width: extent,
    height: extent,
    rotation,
    scaleX: scale,
    scaleY: scale,
  })
  .strict();

const SpriteRenderer = z
  .object({
    assetId: nullableId,
    frame: z.string().trim().min(1).max(120).nullable(),
    visible: z.boolean(),
    opacity: finite.min(0).max(1),
    flipX: z.boolean(),
    flipY: z.boolean(),
  })
  .strict();

const Collider = z.discriminatedUnion("shape", [
  z
    .object({
      shape: z.literal("RECTANGLE"),
      width: extent,
      height: extent,
      offsetX: coordinate,
      offsetY: coordinate,
      isTrigger: z.boolean(),
      collisionLayerId: nullableId,
    })
    .strict(),
  z
    .object({
      shape: z.literal("CIRCLE"),
      radius: extent,
      offsetX: coordinate,
      offsetY: coordinate,
      isTrigger: z.boolean(),
      collisionLayerId: nullableId,
    })
    .strict(),
]);

const AnimationState = z
  .object({
    name: boundedName,
    row: z.number().int().nonnegative(),
    frames: z.number().int().positive().max(1_000),
    frameDurationMs: z.number().int().positive().max(60_000),
    loop: z.boolean(),
  })
  .strict();

const Animator = z
  .object({
    assetId: nullableId,
    frameWidth: z.number().int().positive().max(8_192),
    frameHeight: z.number().int().positive().max(8_192),
    initialState: boundedName.nullable(),
    states: z.array(AnimationState).max(100),
  })
  .strict()
  .superRefine((animator, context) => {
    const names = new Set<string>();
    animator.states.forEach((state, index) => {
      if (names.has(state.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Animation state names must be unique",
          path: ["states", index, "name"],
        });
      }
      names.add(state.name);
    });
    if (animator.initialState && !names.has(animator.initialState)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Initial animation state must exist",
        path: ["initialState"],
      });
    }
  });

const DialogueChoice = z
  .object({
    id: StableId,
    text: z.string().trim().min(1).max(500),
    conditionId: nullableId,
    eventId: nullableId,
  })
  .strict();

const DialogueNode = z
  .object({
    id: StableId,
    speakerName: z.string().trim().max(80),
    avatarAssetId: nullableId,
    text: z.string().trim().max(5_000),
    choices: z.array(DialogueChoice).max(100),
  })
  .strict()
  .superRefine((node, context) => {
    const ids = new Set<string>();
    node.choices.forEach((choice, index) => {
      if (ids.has(choice.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dialogue choice IDs must be unique",
          path: ["choices", index, "id"],
        });
      }
      ids.add(choice.id);
    });
  });

const Dialogue = z
  .object({
    startNodeId: nullableId,
    nodes: z.array(DialogueNode).max(500),
  })
  .strict()
  .superRefine((dialogue, context) => {
    const ids = new Set<string>();
    dialogue.nodes.forEach((node, index) => {
      if (ids.has(node.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dialogue node IDs must be unique",
          path: ["nodes", index, "id"],
        });
      }
      ids.add(node.id);
    });
    if (dialogue.startNodeId && !ids.has(dialogue.startNodeId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dialogue start node must exist",
        path: ["startNodeId"],
      });
    }
  });

const VariableReference = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("GLOBAL"), variableId: StableId }).strict(),
  z.object({ scope: z.literal("PLAYER"), variableId: StableId }).strict(),
  z
    .object({
      scope: z.literal("SCENE"),
      sceneId: StableId,
      variableId: StableId,
    })
    .strict(),
]);

const uiCommonShape = {
  anchorX: finite.min(0).max(1),
  anchorY: finite.min(0).max(1),
  visible: z.boolean(),
  visibilityVariable: VariableReference.nullable(),
};

const uiCommonDefaults = {
  anchorX: 0.5,
  anchorY: 0.5,
  visible: true,
  visibilityVariable: null,
} as const;

function validateUiContext(
  properties: unknown,
  context: V2ComponentContext,
  eventField: "actionEventId" | "eventId",
): string[] {
  const value = properties as {
    visibilityVariable?: {
      scope?: unknown;
      sceneId?: unknown;
      variableId?: unknown;
    } | null;
    actionEventId?: unknown;
    eventId?: unknown;
  };
  const reference = value.visibilityVariable;
  const variableDiagnostics = (() => {
    if (!reference || typeof reference.variableId !== "string") return [];
    if (reference.scope === "GLOBAL") {
      return context.globalVariableIds.has(reference.variableId)
        ? []
        : ["UI component references a variable outside its declared scope"];
    }
    if (reference.scope === "PLAYER") {
      return context.playerVariableIds.has(reference.variableId)
        ? []
        : ["UI component references a variable outside its declared scope"];
    }
    if (reference.scope === "SCENE" && typeof reference.sceneId === "string") {
      if (!context.sceneIds.has(reference.sceneId)) {
        return ["UI component references a scene that does not exist"];
      }
      return context.sceneVariableIds
        .get(reference.sceneId)
        ?.has(reference.variableId)
        ? []
        : ["UI component references a variable outside its declared scene"];
    }
    return [];
  })();
  return [
    ...variableDiagnostics,
    ...missingReference(
      value[eventField],
      context.eventIds,
      "UI component references an event that does not exist",
    ),
  ];
}

const Tile = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    tile: z.number().int().nonnegative().max(1_000_000),
  })
  .strict();

const Tilemap = z
  .object({
    tilesetAssetId: nullableId,
    tileWidth: z.number().int().positive().max(1_024),
    tileHeight: z.number().int().positive().max(1_024),
    columns: z.number().int().positive().max(1_024),
    rows: z.number().int().positive().max(1_024),
    tiles: z.array(Tile).max(262_144),
  })
  .strict()
  .superRefine((tilemap, context) => {
    const cells = new Set<string>();
    tilemap.tiles.forEach((tile, index) => {
      if (tile.x >= tilemap.columns || tile.y >= tilemap.rows) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tile coordinates must be inside the tilemap",
          path: ["tiles", index],
        });
      }
      const cell = `${tile.x}:${tile.y}`;
      if (cells.has(cell)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tile coordinates must be unique",
          path: ["tiles", index],
        });
      }
      cells.add(cell);
    });
  });

export const v2ComponentRegistry: Readonly<
  Record<V2ComponentType, V2ComponentDefinition>
> = {
  Transform: definition("Transform", Transform, () => ({
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  })),
  SpriteRenderer: definition(
    "SpriteRenderer",
    SpriteRenderer,
    () => ({
      assetId: null,
      frame: null,
      visible: true,
      opacity: 1,
      flipX: false,
      flipY: false,
    }),
    {
      validateContext: (properties, context) =>
        missingReference(
          (properties as { assetId?: unknown }).assetId,
          context.assetIds,
          "Component references an asset that is not declared by the project",
        ),
    },
  ),
  Collider: definition(
    "Collider",
    Collider,
    () => ({
      shape: "RECTANGLE",
      width: 32,
      height: 32,
      offsetX: 0,
      offsetY: 0,
      isTrigger: false,
      collisionLayerId: null,
    }),
    {
      validateContext: (properties, context) => {
        const layerId = (properties as { collisionLayerId?: unknown })
          .collisionLayerId;
        const missing = missingReference(
          layerId,
          context.layers,
          "Collider references a layer that does not exist",
        );
        if (missing.length > 0 || typeof layerId !== "string") return missing;
        return context.layers.get(layerId) === "COLLISION"
          ? []
          : ["Collider must reference a COLLISION layer"];
      },
    },
  ),
  Animator: definition(
    "Animator",
    Animator,
    () => ({
      assetId: null,
      frameWidth: 32,
      frameHeight: 32,
      initialState: null,
      states: [],
    }),
    {
      validateContext: (properties, context) =>
        missingReference(
          (properties as { assetId?: unknown }).assetId,
          context.assetIds,
          "Animator references an asset that is not declared by the project",
        ),
    },
  ),
  Movement: definition(
    "Movement",
    z
      .object({
        speed: nonNegative,
        controls: z.enum(["PLAYER", "AI", "NONE"]),
        initialDirection: z.enum(["UP", "DOWN", "LEFT", "RIGHT"]),
      })
      .strict(),
    () => ({ speed: 120, controls: "NONE", initialDirection: "DOWN" }),
  ),
  Health: definition(
    "Health",
    z
      .object({
        current: nonNegative,
        maximum: positive,
      })
      .strict()
      .refine((health) => health.current <= health.maximum, {
        message: "Current health cannot exceed maximum health",
        path: ["current"],
      }),
    () => ({ current: 100, maximum: 100 }),
  ),
  Dialogue: definition(
    "Dialogue",
    Dialogue,
    () => ({ startNodeId: null, nodes: [] }),
    {
      validateContext: (properties, context) => {
        const nodes =
          (
            properties as {
              nodes?: Array<{
                avatarAssetId?: unknown;
                choices?: Array<{ conditionId?: unknown; eventId?: unknown }>;
              }>;
            }
          ).nodes ?? [];
        const issues: string[] = [];
        if (
          nodes.some(
            (node) =>
              typeof node.avatarAssetId === "string" &&
              !context.assetIds.has(node.avatarAssetId),
          )
        ) {
          issues.push(
            "Dialogue references an asset that is not declared by the project",
          );
        }
        if (
          nodes.some((node) =>
            node.choices?.some(
              (choice) =>
                typeof choice.conditionId === "string" &&
                !context.conditionIds.has(choice.conditionId),
            ),
          )
        ) {
          issues.push("Dialogue references a condition that does not exist");
        }
        if (
          nodes.some((node) =>
            node.choices?.some(
              (choice) =>
                typeof choice.eventId === "string" &&
                !context.eventIds.has(choice.eventId),
            ),
          )
        ) {
          issues.push("Dialogue references an event that does not exist");
        }
        return issues;
      },
    },
  ),
  Interactable: definition(
    "Interactable",
    z
      .object({
        range: nonNegative.max(10_000),
        prompt: z.string().max(200),
        enabled: z.boolean(),
        eventId: nullableId,
      })
      .strict(),
    () => ({ range: 64, prompt: "", enabled: true, eventId: null }),
    {
      validateContext: (properties, context) =>
        missingReference(
          (properties as { eventId?: unknown }).eventId,
          context.eventIds,
          "Interactable references an event that does not exist",
        ),
    },
  ),
  InventoryItem: definition(
    "InventoryItem",
    z
      .object({
        itemKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        displayName: boundedName,
        description: z.string().max(2_000),
        iconAssetId: nullableId,
        collectible: z.boolean(),
        quantityMode: z.enum(["SINGLE", "STACK"]),
        maximumQuantity: z.number().int().positive().max(1_000_000),
        appearanceConditionId: nullableId,
        triggerEventId: nullableId,
      })
      .strict(),
    () => ({
      itemKey: "item",
      displayName: "Item",
      description: "",
      iconAssetId: null,
      collectible: true,
      quantityMode: "SINGLE",
      maximumQuantity: 1,
      appearanceConditionId: null,
      triggerEventId: null,
    }),
    {
      validateContext: (properties, context) => {
        const value = properties as {
          iconAssetId?: unknown;
          appearanceConditionId?: unknown;
          triggerEventId?: unknown;
        };
        return [
          ...missingReference(
            value.iconAssetId,
            context.assetIds,
            "Inventory item references an asset that is not declared by the project",
          ),
          ...missingReference(
            value.appearanceConditionId,
            context.conditionIds,
            "Inventory item references a condition that does not exist",
          ),
          ...missingReference(
            value.triggerEventId,
            context.eventIds,
            "Inventory item references an event that does not exist",
          ),
        ];
      },
    },
  ),
  Trigger: definition(
    "Trigger",
    z
      .object({
        width: extent,
        height: extent,
        activation: z.enum(["ENTER", "EXIT", "INTERACT", "CLICK"]),
        once: z.boolean(),
        cooldownMs: z.number().int().nonnegative().max(86_400_000),
        conditionId: nullableId,
        eventIds: z.array(StableId).max(100),
      })
      .strict(),
    () => ({
      width: 32,
      height: 32,
      activation: "ENTER",
      once: false,
      cooldownMs: 0,
      conditionId: null,
      eventIds: [],
    }),
    {
      validateContext: (properties, context) => {
        const value = properties as {
          conditionId?: unknown;
          eventIds?: unknown;
        };
        return [
          ...missingReference(
            value.conditionId,
            context.conditionIds,
            "Trigger references a condition that does not exist",
          ),
          ...missingReferences(
            value.eventIds,
            context.eventIds,
            "Trigger references an event that does not exist",
          ),
        ];
      },
    },
  ),
  AudioSource: definition(
    "AudioSource",
    z
      .object({
        assetId: nullableId,
        volume: finite.min(0).max(1),
        loop: z.boolean(),
        autoplay: z.boolean(),
        triggerEventId: nullableId,
        fadeInMs: z.number().int().nonnegative().max(600_000),
        fadeOutMs: z.number().int().nonnegative().max(600_000),
      })
      .strict(),
    () => ({
      assetId: null,
      volume: 1,
      loop: false,
      autoplay: false,
      triggerEventId: null,
      fadeInMs: 0,
      fadeOutMs: 0,
    }),
    {
      validateContext: (properties, context) => {
        const value = properties as {
          assetId?: unknown;
          triggerEventId?: unknown;
        };
        return [
          ...missingReference(
            value.assetId,
            context.assetIds,
            "Audio source references an asset that is not declared by the project",
          ),
          ...missingReference(
            value.triggerEventId,
            context.eventIds,
            "Audio source references an event that does not exist",
          ),
        ];
      },
    },
  ),
  Quest: definition(
    "Quest",
    z
      .object({
        questKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        initialState: boundedName,
      })
      .strict(),
    () => ({ questKey: "quest", initialState: "NOT_STARTED" }),
  ),
  Script: definition(
    "Script",
    z
      .object({
        scriptIds: z.array(StableId).max(32),
      })
      .strict(),
    () => ({ scriptIds: [] }),
    {
      validateContext: (properties, context) =>
        missingReferences(
          (properties as { scriptIds?: unknown }).scriptIds,
          context.scriptIds,
          "Script component references a script that does not exist",
        ),
    },
  ),
  Text: definition(
    "Text",
    z
      .object({
        ...uiCommonShape,
        text: z.string().max(5_000),
        fontAssetId: nullableId,
        fontSize: positive.max(512),
        color,
        align: z.enum(["LEFT", "CENTER", "RIGHT"]),
        actionEventId: nullableId,
      })
      .strict(),
    () => ({
      ...uiCommonDefaults,
      text: "",
      fontAssetId: null,
      fontSize: 16,
      color: "#ffffff",
      align: "LEFT",
      actionEventId: null,
    }),
    {
      allowedLayerTypes: ["UI"],
      validateContext: (properties, context) => [
        ...missingReference(
          (properties as { fontAssetId?: unknown }).fontAssetId,
          context.assetIds,
          "Text references a font asset that is not declared by the project",
        ),
        ...validateUiContext(properties, context, "actionEventId"),
      ],
    },
  ),
  UIImage: definition(
    "UIImage",
    z
      .object({
        ...uiCommonShape,
        assetId: nullableId,
        opacity: finite.min(0).max(1),
        actionEventId: nullableId,
      })
      .strict(),
    () => ({
      ...uiCommonDefaults,
      assetId: null,
      opacity: 1,
      actionEventId: null,
    }),
    {
      allowedLayerTypes: ["UI"],
      validateContext: (properties, context) => [
        ...missingReference(
          (properties as { assetId?: unknown }).assetId,
          context.assetIds,
          "UI image references an asset that is not declared by the project",
        ),
        ...validateUiContext(properties, context, "actionEventId"),
      ],
    },
  ),
  UIButton: definition(
    "UIButton",
    z
      .object({
        ...uiCommonShape,
        label: z.string().max(500),
        eventId: nullableId,
        enabled: z.boolean(),
      })
      .strict(),
    () => ({
      ...uiCommonDefaults,
      label: "Button",
      eventId: null,
      enabled: true,
    }),
    {
      allowedLayerTypes: ["UI"],
      validateContext: (properties, context) =>
        validateUiContext(properties, context, "eventId"),
    },
  ),
  UIPanel: definition(
    "UIPanel",
    z
      .object({
        ...uiCommonShape,
        backgroundColor: color,
        opacity: finite.min(0).max(1),
        borderColor: color.nullable(),
        actionEventId: nullableId,
      })
      .strict(),
    () => ({
      ...uiCommonDefaults,
      backgroundColor: "#202842",
      opacity: 1,
      borderColor: null,
      actionEventId: null,
    }),
    {
      allowedLayerTypes: ["UI"],
      validateContext: (properties, context) =>
        validateUiContext(properties, context, "actionEventId"),
    },
  ),
  Camera: definition(
    "Camera",
    z
      .object({
        followObjectId: nullableId,
        bounds: z
          .object({
            x: coordinate,
            y: coordinate,
            width: extent,
            height: extent,
          })
          .strict()
          .nullable(),
        smoothing: finite.min(0).max(1),
      })
      .strict(),
    () => ({ followObjectId: null, bounds: null, smoothing: 0 }),
    {
      allowedLayerTypes: ["WORLD"],
      validateContext: (properties, context) =>
        missingReference(
          (properties as { followObjectId?: unknown }).followObjectId,
          context.objectIds,
          "Camera references an object that does not exist",
        ),
    },
  ),
  Tilemap: definition(
    "Tilemap",
    Tilemap,
    () => ({
      tilesetAssetId: null,
      tileWidth: 32,
      tileHeight: 32,
      columns: 1,
      rows: 1,
      tiles: [],
    }),
    {
      allowedLayerTypes: ["WORLD", "COLLISION"],
      validateContext: (properties, context) =>
        missingReference(
          (properties as { tilesetAssetId?: unknown }).tilesetAssetId,
          context.assetIds,
          "Tilemap references an asset that is not declared by the project",
        ),
    },
  ),
  SpawnPoint: definition(
    "SpawnPoint",
    z
      .object({
        tag: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        initial: z.boolean(),
      })
      .strict(),
    () => ({ tag: "default", initial: false }),
  ),
  MiniGame: definition(
    "MiniGame",
    z
      .object({
        moduleId: nullableId,
        returnSceneId: nullableId,
        resultEventId: nullableId,
      })
      .strict(),
    () => ({ moduleId: null, returnSceneId: null, resultEventId: null }),
    {
      validateContext: (properties, context) => {
        const value = properties as {
          moduleId?: unknown;
          returnSceneId?: unknown;
          resultEventId?: unknown;
        };
        return [
          ...missingReference(
            value.moduleId,
            context.moduleIds,
            "Mini-game component references a module that does not exist",
          ),
          ...missingReference(
            value.returnSceneId,
            context.sceneIds,
            "Mini-game component references a scene that does not exist",
          ),
          ...missingReference(
            value.resultEventId,
            context.eventIds,
            "Mini-game component references an event that does not exist",
          ),
        ];
      },
    },
  ),
  Custom: definition(
    "Custom",
    z
      .object({
        definitionKey: z
          .string()
          .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)
          .max(120),
        config: SafeJsonObject,
      })
      .strict(),
    () => ({ definitionKey: "custom.component", config: {} }),
  ),
};

export function validateV2ComponentContext(
  type: V2ComponentType,
  properties: unknown,
  context: V2ComponentContext,
): string[] {
  const definition = v2ComponentRegistry[type];
  if (!definition.schema.safeParse(properties).success) return [];
  return definition.validateContext(properties, context);
}
