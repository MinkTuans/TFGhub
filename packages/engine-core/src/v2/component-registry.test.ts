import { describe, expect, it } from "vitest";
import {
  V2_COMPONENT_TYPES,
  V2_GEOMETRY_LIMITS,
  v2ComponentRegistry,
  validateV2ComponentContext,
} from "./component-registry.js";

const ids = {
  asset: "11111111-1111-4111-8111-111111111111",
  scene: "22222222-2222-4222-8222-222222222222",
  object: "33333333-3333-4333-8333-333333333333",
  layer: "44444444-4444-4444-8444-444444444444",
  event: "55555555-5555-4555-8555-555555555555",
  script: "66666666-6666-4666-8666-666666666666",
  module: "77777777-7777-4777-8777-777777777777",
};

describe("V2 component registry", () => {
  it("normalizes older V2 transforms to a center pivot without mutating them", () => {
    const input = {
      x: 3,
      y: 4,
      width: 20,
      height: 10,
      rotation: 90,
      scaleX: -1,
      scaleY: 2,
    };
    expect(v2ComponentRegistry.Transform.schema.parse(input)).toEqual({
      ...input,
      pivot: { x: 0.5, y: 0.5 },
    });
    expect(input).not.toHaveProperty("pivot");
    expect(v2ComponentRegistry.Transform.defaults()).toHaveProperty("pivot", {
      x: 0.5,
      y: 0.5,
    });
  });

  it.each([
    { x: 0, y: 0 },
    { x: 0.5, y: 1 },
    { x: 1, y: 1 },
  ])("preserves an explicit normalized pivot %j", (pivot) => {
    const parsed = v2ComponentRegistry.Transform.schema.safeParse({
      ...(v2ComponentRegistry.Transform.defaults() as object),
      pivot,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toHaveProperty("pivot", pivot);
  });

  it.each([
    { x: -0.1, y: 0 },
    { x: 0, y: 1.1 },
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: 0 },
    { x: 0, y: 0, z: 0 },
    null,
  ])("rejects invalid pivot %j", (pivot) => {
    expect(
      v2ComponentRegistry.Transform.schema.safeParse({
        ...(v2ComponentRegistry.Transform.defaults() as object),
        pivot,
      }).success,
    ).toBe(false);
  });

  it("provides the complete composable component set with valid defaults and metadata-only handler keys", () => {
    expect(V2_COMPONENT_TYPES).toEqual([
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
    ]);

    for (const type of V2_COMPONENT_TYPES) {
      const definition = v2ComponentRegistry[type];
      expect(definition.version).toBe(1);
      expect(definition.schema.safeParse(definition.defaults()).success).toBe(
        true,
      );
      expect(definition.runtimeHandlerKey).toMatch(/^tfg\.v2\.[a-z-]+\.v1$/);
      expect(definition.migrations).toEqual({});
      expect(
        JSON.stringify({ type, version: 1, properties: definition.defaults() }),
      ).not.toContain("runtimeHandlerKey");
    }
  });

  it.each([
    [
      "Transform",
      {
        x: Number.NaN,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    ],
    [
      "Transform",
      { x: 0, y: 0, width: 0, height: 1, rotation: 0, scaleX: 1, scaleY: 1 },
    ],
    [
      "SpriteRenderer",
      {
        assetId: null,
        frame: null,
        visible: true,
        opacity: 2,
        flipX: false,
        flipY: false,
      },
    ],
    ["Movement", { speed: -1, controls: "PLAYER", initialDirection: "DOWN" }],
    ["Health", { current: 101, maximum: 100 }],
    [
      "AudioSource",
      {
        assetId: null,
        volume: 1.1,
        loop: false,
        autoplay: false,
        triggerEventId: null,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ],
    ["Custom", { definitionKey: "bad key", config: {} }],
    [
      "Custom",
      { definitionKey: "weather.rain", config: { execute: () => true } },
    ],
  ] as const)("rejects invalid %s properties", (type, properties) => {
    expect(v2ComponentRegistry[type].schema.safeParse(properties).success).toBe(
      false,
    );
  });

  it("rejects duplicate animation states and duplicate dialogue node or choice IDs", () => {
    const state = {
      name: "idle",
      row: 0,
      frames: 1,
      frameDurationMs: 100,
      loop: true,
    };
    expect(
      v2ComponentRegistry.Animator.schema.safeParse({
        assetId: null,
        frameWidth: 32,
        frameHeight: 32,
        initialState: "idle",
        states: [state, state],
      }).success,
    ).toBe(false);

    const nodeId = "88888888-8888-4888-8888-888888888888";
    const choiceId = "99999999-9999-4999-8999-999999999999";
    const node = {
      id: nodeId,
      speakerName: "NPC",
      avatarAssetId: null,
      text: "Hello",
      choices: [
        { id: choiceId, text: "Continue", conditionId: null, eventId: null },
        { id: choiceId, text: "Again", conditionId: null, eventId: null },
      ],
    };
    expect(
      v2ComponentRegistry.Dialogue.schema.safeParse({
        startNodeId: nodeId,
        nodes: [node],
      }).success,
    ).toBe(false);
  });

  it("rejects cyclic or over-depth custom config without crashing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      v2ComponentRegistry.Custom.schema.safeParse({
        definitionKey: "weather.rain",
        config: cyclic,
      }),
    ).not.toThrow();
    expect(
      v2ComponentRegistry.Custom.schema.safeParse({
        definitionKey: "weather.rain",
        config: cyclic,
      }).success,
    ).toBe(false);

    let nested: Record<string, unknown> = {};
    for (let depth = 0; depth < 10; depth += 1) nested = { nested };
    expect(
      v2ComponentRegistry.Custom.schema.safeParse({
        definitionKey: "weather.rain",
        config: nested,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["Date", new Date("2026-09-09T00:00:00.000Z")],
    ["Map", new Map([["weather", "rain"]])],
    [
      "class instance",
      new (class Configuration {
        enabled = true;
      })(),
    ],
  ])("rejects nested non-JSON %s values", (_name, value) => {
    expect(
      v2ComponentRegistry.Custom.schema.safeParse({
        definitionKey: "weather.rain",
        config: { value },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate or out-of-bounds tile cells", () => {
    const base = {
      tilesetAssetId: null,
      tileWidth: 32,
      tileHeight: 32,
      columns: 2,
      rows: 2,
    };
    expect(
      v2ComponentRegistry.Tilemap.schema.safeParse({
        ...base,
        tiles: [{ x: 2, y: 0, tile: 1 }],
      }).success,
    ).toBe(false);
    expect(
      v2ComponentRegistry.Tilemap.schema.safeParse({
        ...base,
        tiles: [
          { x: 0, y: 0, tile: 1 },
          { x: 0, y: 0, tile: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it("reports typed references that are absent from the project context", () => {
    const context = {
      assetIds: new Set<string>(),
      sceneIds: new Set<string>(),
      objectIds: new Set<string>(),
      layers: new Map(),
      eventIds: new Set<string>(),
      conditionIds: new Set<string>(),
      globalVariableIds: new Set<string>(),
      playerVariableIds: new Set<string>(),
      sceneVariableIds: new Map(),
      scriptIds: new Set<string>(),
      moduleIds: new Set<string>(),
    };

    expect(
      validateV2ComponentContext(
        "SpriteRenderer",
        {
          assetId: ids.asset,
          frame: null,
          visible: true,
          opacity: 1,
          flipX: false,
          flipY: false,
        },
        context,
      ),
    ).toEqual([
      "Component references an asset that is not declared by the project",
    ]);

    expect(
      validateV2ComponentContext(
        "Camera",
        {
          followObjectId: ids.object,
          bounds: null,
          smoothing: 0,
        },
        context,
      ),
    ).toEqual(["Camera references an object that does not exist"]);

    expect(
      validateV2ComponentContext(
        "Script",
        {
          scriptIds: [ids.script],
        },
        context,
      ),
    ).toEqual(["Script component references a script that does not exist"]);

    expect(
      validateV2ComponentContext(
        "MiniGame",
        {
          moduleId: ids.module,
          returnSceneId: ids.scene,
          resultEventId: ids.event,
        },
        context,
      ),
    ).toEqual([
      "Mini-game component references a module that does not exist",
      "Mini-game component references a scene that does not exist",
      "Mini-game component references an event that does not exist",
    ]);
  });

  it("accepts typed references present in the project context", () => {
    const context = {
      assetIds: new Set([ids.asset]),
      sceneIds: new Set([ids.scene]),
      objectIds: new Set([ids.object]),
      layers: new Map([[ids.layer, "COLLISION" as const]]),
      eventIds: new Set([ids.event]),
      conditionIds: new Set([ids.event]),
      globalVariableIds: new Set([ids.object]),
      playerVariableIds: new Set<string>(),
      sceneVariableIds: new Map(),
      scriptIds: new Set([ids.script]),
      moduleIds: new Set([ids.module]),
    };
    expect(
      validateV2ComponentContext(
        "MiniGame",
        {
          moduleId: ids.module,
          returnSceneId: ids.scene,
          resultEventId: ids.event,
        },
        context,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "Collider",
      {
        shape: "RECTANGLE",
        width: 1,
        height: 1,
        offsetX: 0,
        offsetY: 0,
        isTrigger: false,
        collisionLayerId: ids.layer,
      },
      ["Collider references a layer that does not exist"],
    ],
    [
      "InventoryItem",
      {
        itemKey: "key",
        displayName: "Key",
        description: "",
        iconAssetId: ids.asset,
        collectible: true,
        quantityMode: "SINGLE",
        maximumQuantity: 1,
        appearanceConditionId: ids.event,
        triggerEventId: ids.event,
      },
      [
        "Inventory item references an asset that is not declared by the project",
        "Inventory item references a condition that does not exist",
        "Inventory item references an event that does not exist",
      ],
    ],
    [
      "Trigger",
      {
        width: 10,
        height: 10,
        activation: "ENTER",
        once: false,
        cooldownMs: 0,
        conditionId: ids.event,
        eventIds: [ids.event],
      },
      [
        "Trigger references a condition that does not exist",
        "Trigger references an event that does not exist",
      ],
    ],
    [
      "AudioSource",
      {
        assetId: ids.asset,
        volume: 1,
        loop: false,
        autoplay: false,
        triggerEventId: ids.event,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
      [
        "Audio source references an asset that is not declared by the project",
        "Audio source references an event that does not exist",
      ],
    ],
    [
      "Text",
      {
        anchorX: 0.5,
        anchorY: 0.5,
        visible: true,
        visibilityVariable: null,
        text: "Score",
        fontAssetId: ids.asset,
        fontSize: 16,
        color: "#ffffff",
        align: "LEFT",
        actionEventId: null,
      },
      ["Text references a font asset that is not declared by the project"],
    ],
  ] as const)(
    "validates every typed reference owned by %s",
    (type, properties, expected) => {
      const emptyContext = {
        assetIds: new Set<string>(),
        sceneIds: new Set<string>(),
        objectIds: new Set<string>(),
        layers: new Map(),
        eventIds: new Set<string>(),
        conditionIds: new Set<string>(),
        globalVariableIds: new Set<string>(),
        playerVariableIds: new Set<string>(),
        sceneVariableIds: new Map(),
        scriptIds: new Set<string>(),
        moduleIds: new Set<string>(),
      };
      expect(
        validateV2ComponentContext(type, properties, emptyContext),
      ).toEqual(expected);
    },
  );

  it("defines complete shared UI display, anchoring, binding, and action properties", () => {
    for (const type of ["Text", "UIImage", "UIButton", "UIPanel"] as const) {
      const defaults = v2ComponentRegistry[type].defaults() as Record<
        string,
        unknown
      >;
      expect(defaults).toMatchObject({
        anchorX: 0.5,
        anchorY: 0.5,
        visible: true,
        visibilityVariable: null,
      });
      expect(v2ComponentRegistry[type].schema.safeParse(defaults).success).toBe(
        true,
      );
    }
    expect(v2ComponentRegistry.UIImage.defaults()).toMatchObject({
      actionEventId: null,
    });
    expect(v2ComponentRegistry.UIButton.defaults()).toMatchObject({
      eventId: null,
    });
  });

  it("validates UI variable bindings and action references contextually", () => {
    const properties = {
      ...(v2ComponentRegistry.UIPanel.defaults() as Record<string, unknown>),
      visibilityVariable: { scope: "GLOBAL", variableId: ids.object },
      actionEventId: ids.event,
    };
    const context = {
      assetIds: new Set<string>(),
      sceneIds: new Set<string>(),
      objectIds: new Set<string>(),
      layers: new Map(),
      eventIds: new Set<string>(),
      conditionIds: new Set<string>(),
      globalVariableIds: new Set<string>(),
      playerVariableIds: new Set([ids.object]),
      sceneVariableIds: new Map(),
      scriptIds: new Set<string>(),
      moduleIds: new Set<string>(),
    };
    expect(validateV2ComponentContext("UIPanel", properties, context)).toEqual([
      "UI component references a variable outside its declared scope",
      "UI component references an event that does not exist",
    ]);
  });

  it("rejects cross-scope and wrong-scene variable bindings", () => {
    const base = v2ComponentRegistry.UIPanel.defaults() as Record<
      string,
      unknown
    >;
    const otherScene = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const context = {
      assetIds: new Set<string>(),
      sceneIds: new Set([ids.scene, otherScene]),
      objectIds: new Set<string>(),
      layers: new Map(),
      eventIds: new Set<string>(),
      conditionIds: new Set<string>(),
      globalVariableIds: new Set<string>(),
      playerVariableIds: new Set([ids.object]),
      sceneVariableIds: new Map([
        [ids.scene, new Set([ids.object])],
        [otherScene, new Set<string>()],
      ]),
      scriptIds: new Set<string>(),
      moduleIds: new Set<string>(),
    };
    expect(
      validateV2ComponentContext(
        "UIPanel",
        {
          ...base,
          visibilityVariable: { scope: "GLOBAL", variableId: ids.object },
        },
        context,
      ),
    ).toEqual([
      "UI component references a variable outside its declared scope",
    ]);
    expect(
      validateV2ComponentContext(
        "UIPanel",
        {
          ...base,
          visibilityVariable: {
            scope: "SCENE",
            sceneId: otherScene,
            variableId: ids.object,
          },
        },
        context,
      ),
    ).toEqual([
      "UI component references a variable outside its declared scene",
    ]);
    expect(
      validateV2ComponentContext(
        "UIPanel",
        {
          ...base,
          visibilityVariable: {
            scope: "SCENE",
            sceneId: ids.scene,
            variableId: ids.object,
          },
        },
        context,
      ),
    ).toEqual([]);
  });

  it("enforces explicit bounds for every geometry-bearing component", () => {
    const tooLarge = V2_GEOMETRY_LIMITS.extent + 1;
    const tooFar = V2_GEOMETRY_LIMITS.coordinate + 1;
    expect(
      v2ComponentRegistry.Transform.schema.safeParse({
        x: tooFar,
        y: 0,
        width: tooLarge,
        height: 1,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      }).success,
    ).toBe(false);
    expect(
      v2ComponentRegistry.Collider.schema.safeParse({
        shape: "RECTANGLE",
        width: tooLarge,
        height: 1,
        offsetX: tooFar,
        offsetY: 0,
        isTrigger: false,
        collisionLayerId: null,
      }).success,
    ).toBe(false);
    expect(
      v2ComponentRegistry.Trigger.schema.safeParse({
        width: tooLarge,
        height: 1,
        activation: "ENTER",
        once: false,
        cooldownMs: 0,
        conditionId: null,
        eventIds: [],
      }).success,
    ).toBe(false);
    expect(
      v2ComponentRegistry.Camera.schema.safeParse({
        followObjectId: null,
        bounds: { x: tooFar, y: 0, width: tooLarge, height: 1 },
        smoothing: 0,
      }).success,
    ).toBe(false);
  });

  it("requires collider layer references to target a collision layer", () => {
    const properties = {
      shape: "RECTANGLE",
      width: 1,
      height: 1,
      offsetX: 0,
      offsetY: 0,
      isTrigger: false,
      collisionLayerId: ids.layer,
    };
    const context = {
      assetIds: new Set<string>(),
      sceneIds: new Set<string>(),
      objectIds: new Set<string>(),
      layers: new Map([[ids.layer, "WORLD" as const]]),
      eventIds: new Set<string>(),
      conditionIds: new Set<string>(),
      globalVariableIds: new Set<string>(),
      playerVariableIds: new Set<string>(),
      sceneVariableIds: new Map(),
      scriptIds: new Set<string>(),
      moduleIds: new Set<string>(),
    };
    expect(validateV2ComponentContext("Collider", properties, context)).toEqual(
      ["Collider must reference a COLLISION layer"],
    );
    context.layers.set(ids.layer, "COLLISION");
    expect(validateV2ComponentContext("Collider", properties, context)).toEqual(
      [],
    );
  });
});
