import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as engine from "../index.js";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;
const sceneId = id("0002");

function project() {
  return engine.EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id("0001"),
    engineFamily: "TFG_ENGINE",
    entrySceneId: sceneId,
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [],
    scenes: [0, 1].map((order) => ({
      id: order === 0 ? sceneId : id("0003"),
      name: order === 0 ? "Opening" : "Ending",
      key: `scene-${order}`,
      order,
      type: "MIXED",
      width: 640,
      height: 480,
      background: { color: "#102030", assetId: null },
      settings: {
        gravityX: 0,
        gravityY: 0,
        grid: { enabled: false, size: 32, snap: false },
      },
      layers: [
        {
          id: id(`000${order + 4}`),
          name: "World",
          order: 0,
          type: "WORLD",
          visible: true,
          locked: false,
        },
      ],
      objects: [],
    })),
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  });
}

function reducer() {
  expect(engine).toHaveProperty("applyProjectMutations");
  return engine.applyProjectMutations;
}

const rename = (name: string, target = sceneId) => ({
  type: "scene.rename" as const,
  sceneId: target,
  name,
});

describe("object and component authoring", () => {
  const component = (
    suffix: string,
    type: engine.V2ComponentType,
    properties?: unknown,
  ) => ({
    id: id(suffix),
    type,
    version: 1 as const,
    properties: properties ?? engine.v2ComponentRegistry[type].defaults(),
  });
  const object = (suffix = "0010", order = 0): engine.GameObjectV2Type => ({
    id: id(suffix),
    name: "Object",
    objectType: "CUSTOM",
    parentId: null,
    layerId: id("0004"),
    enabled: true,
    visible: true,
    locked: false,
    order,
    renderOrder: -4,
    components: [
      component(String(Number(suffix) + 1).padStart(4, "0"), "Transform"),
    ],
  });
  const apply = (input: engine.EngineProjectV2Type, commands: unknown[]) =>
    engine.applyProjectMutations(input, commands as engine.ProjectMutation[]);
  const history = (input: engine.EngineProjectV2Type, commands: unknown[]) =>
    engine.applyProjectMutationsWithHistory(
      input,
      commands as engine.ProjectMutation[],
    );
  const create = (...objects: engine.GameObjectV2Type[]) => ({
    type: "object.create",
    sceneId,
    objects: objects.map((object) => ({ object, beforeObjectId: null })),
  });
  const update = (changes: object, objectId = id("0010")) => ({
    type: "object.update",
    sceneId,
    objectId,
    changes,
  });
  const remove = (...objectIds: string[]) => ({
    type: "object.delete",
    sceneId,
    objectIds,
    confirmed: true,
  });
  const add = (value: ReturnType<typeof component>, objectId = id("0010")) => ({
    type: "component.add",
    sceneId,
    objectId,
    component: value,
    beforeComponentId: null,
  });
  const editComponent = (componentId: string, properties: unknown) => ({
    type: "component.update",
    sceneId,
    objectId: id("0010"),
    componentId,
    properties,
  });
  const removeComponent = (componentId: string) => ({
    type: "component.remove",
    sceneId,
    objectId: id("0010"),
    componentId,
  });
  function populated() {
    const input = project();
    input.scenes[0]!.layers.push({
      ...input.scenes[0]!.layers[0]!,
      id: id("0006"),
      type: "UI",
      order: 1,
    });
    input.scenes[0]!.layers.push({
      ...input.scenes[0]!.layers[0]!,
      id: id("0007"),
      type: "COLLISION",
      order: 2,
    });
    input.scenes[0]!.objects = [object(), object("0020", 4)];
    return input;
  }
  function roundTrip(input: engine.EngineProjectV2Type, commands: unknown[]) {
    const result = history(input, commands);
    const restored = history(
      result.document,
      engine.ProjectMutation.array().parse(result.undo),
    );
    expect(restored.document).toEqual(input);
    expect(
      apply(input, engine.ProjectMutation.array().parse(result.redo)),
    ).toEqual(result.document);
    expect(
      apply(input, engine.ProjectMutation.array().parse(restored.undo)),
    ).toEqual(result.document);
    expect(
      engine.EngineProjectV2.parse(JSON.parse(JSON.stringify(result.document))),
    ).toEqual(result.document);
    return result;
  }

  it.each([
    ["PLAYER", ["Movement", "Health", "SpriteRenderer"]],
    ["NPC", ["Dialogue", "Interactable"]],
    ["ITEM", ["InventoryItem", "SpriteRenderer"]],
    ["TRIGGER", ["Trigger", "Collider"]],
    ["UI", ["UIPanel", "Text", "UIImage", "UIButton"]],
    ["DECORATION", ["SpriteRenderer"]],
    ["CUSTOM", ["Custom"]],
  ] as const)("creates a %s solely from shared components", (role, types) => {
    const input = populated();
    const value = object("0030", 8);
    value.objectType = role;
    if (role === "UI") value.layerId = id("0006");
    types.forEach((type, index) =>
      value.components.push(
        component(String(40 + index).padStart(4, "0"), type),
      ),
    );
    const result = roundTrip(input, [create(value)]);
    expect(
      result.document.scenes[0]!.objects.find((entry) => entry.id === value.id),
    ).toEqual(value);
  });

  it.each([
    { name: " Renamed " },
    { parentId: id("0020") },
    { enabled: false },
    { visible: false },
    { locked: true },
    { layerId: id("0006"), order: 9 },
    { renderOrder: -90 },
  ])("updates stable object fields %j with exact undo", (changes) => {
    const input = populated();
    input.scenes[0]!.objects.reverse();
    const result = roundTrip(input, [update(changes)]);
    expect(result.document.scenes[0]!.objects[1]).toMatchObject({
      ...changes,
      ...("name" in changes ? { name: "Renamed" } : {}),
    });
  });

  it("reorders an entire layer using sparse stable-ID orders independent of hierarchy and render order", () => {
    const input = populated();
    input.scenes[0]!.objects[1]!.parentId = id("0010");
    const result = roundTrip(input, [
      {
        type: "object.reorder",
        sceneId,
        layerId: id("0004"),
        orders: [
          { id: id("0020"), order: 0 },
          { id: id("0010"), order: 70 },
        ],
      },
    ]);
    expect(
      result.document.scenes[0]!.objects.map(({ id, order, renderOrder }) => ({
        id,
        order,
        renderOrder,
      })),
    ).toEqual([
      { id: id("0010"), order: 70, renderOrder: -4 },
      { id: id("0020"), order: 0, renderOrder: -4 },
    ]);
  });

  it("duplicates a deep subtree across layers with deterministic fresh owned IDs and typed remapping only", () => {
    const input = populated();
    const [parent, external] = input.scenes[0]!.objects;
    parent!.components.push(
      component("0012", "Dialogue", {
        startNodeId: id("0013"),
        nodes: [
          {
            id: id("0013"),
            speakerName: "NPC",
            text: id("0010"),
            avatarAssetId: null,
            choices: [
              {
                id: id("0014"),
                text: sceneId,
                conditionId: null,
                eventId: null,
              },
            ],
          },
        ],
      }),
      component("0015", "Collider", {
        ...(engine.v2ComponentRegistry.Collider.defaults() as object),
        collisionLayerId: id("0007"),
      }),
      component("0016", "Custom", {
        definitionKey: "custom.ids",
        config: { objectId: id("0010"), nested: { value: 1 } },
      }),
      component("0017", "Camera", {
        followObjectId: external!.id,
        bounds: null,
        smoothing: 0,
      }),
    );
    const child = {
      ...object("0030", 2),
      parentId: parent!.id,
      layerId: id("0006"),
    };
    const grandchild = { ...object("0040", 6), parentId: child.id };
    grandchild.components.push(
      component("0042", "Camera", {
        followObjectId: parent!.id,
        bounds: null,
        smoothing: 0,
      }),
    );
    input.scenes[0]!.objects = [grandchild, external!, parent!, child];
    const command = {
      type: "object.duplicate",
      sceneId,
      objectId: parent!.id,
      newId: id("0090"),
      name: "Copy",
    };
    const before = structuredClone(input);
    const result = roundTrip(input, [command]);
    const copies = result.document.scenes[0]!.objects.slice(4);
    const copiedParent = copies.find((value) => value.id === id("0090"))!;
    const copiedChild = copies.find((value) => value.layerId === id("0006"))!;
    const copiedGrandchild = copies.find(
      (value) => value.parentId === copiedChild.id,
    )!;
    expect(copiedParent.name).toBe("Copy");
    expect(copiedChild.parentId).toBe(copiedParent.id);
    expect(copiedGrandchild.components[1]!.properties).toMatchObject({
      followObjectId: copiedParent.id,
    });
    expect(copiedParent.components[4]!.properties).toMatchObject({
      followObjectId: external!.id,
    });
    expect(copiedParent.components[2]!.properties).toMatchObject({
      collisionLayerId: id("0007"),
    });
    expect(copiedParent.components[3]!.properties).toEqual(
      parent!.components[3]!.properties,
    );
    const dialogue = copiedParent.components[1]!.properties as {
      startNodeId: string;
      nodes: Array<{
        id: string;
        text: string;
        choices: Array<{ id: string; text: string }>;
      }>;
    };
    expect(dialogue.startNodeId).toBe(dialogue.nodes[0]!.id);
    expect(dialogue.nodes[0]!.text).toBe(id("0010"));
    expect(dialogue.nodes[0]!.choices[0]!.text).toBe(sceneId);
    const originalIds = input.scenes[0]!.objects.flatMap((value) => [
      value.id,
      ...value.components.map((entry) => entry.id),
    ]).concat(id("0013"), id("0014"));
    const copiedIds = copies
      .flatMap((value) => [
        value.id,
        ...value.components.map((entry) => entry.id),
      ])
      .concat(dialogue.nodes[0]!.id, dialogue.nodes[0]!.choices[0]!.id);
    expect(new Set(copiedIds).size).toBe(copiedIds.length);
    expect(copiedIds.some((value) => originalIds.includes(value))).toBe(false);
    expect(copies.map((value) => value.renderOrder)).toEqual([-4, -4, -4]);
    expect(apply(input, [command])).toEqual(result.document);
    expect(input).toEqual(before);
    expect(() => apply(result.document, [command])).toThrow(/ID|unique/);
  });

  it("preserves the subtree's explicit relative order when its storage array is shuffled", () => {
    const input = populated();
    input.scenes[0]!.objects[0]!.order = 50;
    const child = { ...object("0030", 10), parentId: id("0010") };
    input.scenes[0]!.objects.push(child);
    const result = roundTrip(input, [
      {
        type: "object.duplicate",
        sceneId,
        objectId: id("0010"),
        newId: id("0090"),
        name: "Copy",
      },
    ]);
    const copies = result.document.scenes[0]!.objects.slice(3);
    expect(copies.find((value) => value.id === id("0090"))!.order).toBe(52);
    expect(copies.find((value) => value.parentId === id("0090"))!.order).toBe(
      51,
    );
  });

  it("restores deletion at exact array anchors including interleaved survivors and cross-layer descendants", () => {
    const input = populated();
    const child = {
      ...object("0030", 2),
      parentId: id("0010"),
      layerId: id("0006"),
    };
    const grandchild = { ...object("0040", 6), parentId: child.id };
    input.scenes[0]!.objects = [
      grandchild,
      input.scenes[0]!.objects[1]!,
      input.scenes[0]!.objects[0]!,
      child,
    ];
    const result = roundTrip(input, [
      remove(id("0010"), child.id, grandchild.id),
    ]);
    expect(result.document.scenes[0]!.objects.map((entry) => entry.id)).toEqual(
      [id("0020")],
    );
  });

  it("keeps forward parent references atomic and create inverses restricted to their exact owned IDs", () => {
    const input = populated();
    const parent = object("0030", 9);
    const result = roundTrip(input, [
      update({ parentId: parent.id }),
      create(parent),
    ]);
    expect(result.document.scenes[0]!.objects[0]!.parentId).toBe(parent.id);
  });

  it("adds, replaces properties, and removes repeatable components using stable IDs and exact positions", () => {
    const input = populated();
    const health = component("0012", "Health");
    const result = roundTrip(input, [
      add(health),
      add(component("0013", "Health")),
      editComponent(health.id, { current: 12, maximum: 90 }),
    ]);
    expect(result.document.scenes[0]!.objects[0]!.components[1]).toEqual({
      ...health,
      properties: { current: 12, maximum: 90 },
    });
    const removed = roundTrip(result.document, [removeComponent(health.id)]);
    expect(
      removed.document.scenes[0]!.objects[0]!.components.map(
        (entry) => entry.id,
      ),
    ).toEqual([id("0011"), id("0013")]);
    expect(result.redo[0]).toEqual(add(health));
  });

  it("replaces Transform atomically while preserving required Transform at the final boundary", () => {
    const input = populated();
    const transform = component("0012", "Transform", {
      x: -12,
      y: 14,
      width: 64,
      height: 48,
      rotation: 23,
      scaleX: -2,
      scaleY: 3,
    });
    const result = roundTrip(input, [
      removeComponent(id("0011")),
      add(transform),
    ]);
    expect(result.document.scenes[0]!.objects[0]!.components).toEqual([
      transform,
    ]);
  });

  it.each([
    [
      "cycle",
      [
        update({ parentId: id("0020") }),
        update({ parentId: id("0010") }, id("0020")),
      ],
      /cycle/,
    ],
    ["missing parent", [update({ parentId: id("0099") })], /parent/],
    ["missing layer", [update({ layerId: id("0099") })], /Object layer/],
    ["required Transform", [removeComponent(id("0011"))], /Transform/],
    ["duplicate Transform", [add(component("0012", "Transform"))], /Transform/],
    ["duplicate ID", [add(component("0011", "Health"))], /ID|unique/],
    ["incompatible UI", [add(component("0012", "Text"))], /compatible/],
    [
      "incompatible camera layer",
      [add(component("0012", "Camera")), update({ layerId: id("0006") })],
      /compatible/,
    ],
    [
      "wrong collider layer",
      [
        add(
          component("0012", "Collider", {
            ...(engine.v2ComponentRegistry.Collider.defaults() as object),
            collisionLayerId: id("0004"),
          }),
        ),
      ],
      /COLLISION/,
    ],
    [
      "missing camera target",
      [
        add(
          component("0012", "Camera", {
            followObjectId: id("0099"),
            bounds: null,
            smoothing: 0,
          }),
        ),
      ],
      /references/,
    ],
    ["missing object", [update({ name: "Missing" }, id("0099"))], /target/i],
    ["missing component", [editComponent(id("0099"), {})], /target/i],
  ])("rejects %s atomically", (_label, commands, message) => {
    const input = populated();
    const before = structuredClone(input);
    expect(() =>
      history(input, [rename("Earlier"), ...(commands as unknown[])]),
    ).toThrow(message as RegExp);
    expect(input).toEqual(before);
  });

  it.each(["x", "y", "width", "height", "rotation", "scaleX", "scaleY"])(
    "rejects non-finite Transform %s values",
    (field) => {
      const input = populated();
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() =>
          apply(input, [
            editComponent(id("0011"), {
              ...(engine.v2ComponentRegistry.Transform.defaults() as object),
              [field]: value,
            }),
          ]),
        ).toThrow(/finite|number|nan/i);
      }
    },
  );

  it.each([
    "camera",
    "event object",
    "event component",
    "choice",
    "script",
    "parent",
  ])("rejects deletion with an incoming %s reference", (kind) => {
    const input = populated();
    const parent = input.scenes[0]!.objects[0]!;
    parent.components.push(
      component("0012", "Dialogue", {
        startNodeId: id("0013"),
        nodes: [
          {
            id: id("0013"),
            speakerName: "",
            avatarAssetId: null,
            text: "",
            choices: [
              { id: id("0014"), text: "Go", eventId: null, conditionId: null },
            ],
          },
        ],
      }),
    );
    if (kind === "camera")
      input.scenes[0]!.objects[1]!.components.push(
        component("0022", "Camera", {
          followObjectId: parent.id,
          bounds: null,
          smoothing: 0,
        }),
      );
    if (kind === "parent") input.scenes[0]!.objects[1]!.parentId = parent.id;
    if (kind === "script")
      input.scripts.push({
        id: id("0050"),
        version: 1,
        name: "Attached",
        language: "JAVASCRIPT",
        source: "",
        capabilities: [],
        attachments: [{ id: id("0051"), type: "OBJECT", objectId: parent.id }],
      });
    if (kind.startsWith("event") || kind === "choice")
      input.events.push({
        id: id("0050"),
        version: 1,
        name: "Incoming",
        enabled: true,
        order: 0,
        trigger:
          kind === "choice"
            ? {
                type: "ON_CHOICE_SELECTED",
                objectId: parent.id,
                componentId: id("0012"),
                choiceId: id("0014"),
              }
            : { type: "ON_CLICK", objectId: parent.id },
        condition:
          kind === "event component"
            ? {
                id: id("0052"),
                version: 1,
                type: "HAS_COMPONENT",
                objectId: parent.id,
                componentId: id("0012"),
              }
            : null,
        steps: [{ id: id("0051"), version: 1, type: "COMPLETE_GAME" }],
      });
    expect(engine.EngineProjectV2.safeParse(input).success).toBe(true);
    const commands =
      kind === "event component" || kind === "choice"
        ? [removeComponent(id("0012"))]
        : [remove(parent.id)];
    expect(() => history(input, commands)).toThrow(
      /references|parent|owner|component/i,
    );
  });

  it("detaches nested component inputs, document, undo and redo from each other", () => {
    const input = populated();
    const custom = component("0012", "Custom", {
      definitionKey: "custom.config",
      config: { nested: { value: 1 } },
    });
    input.scenes[0]!.objects[0]!.components.push(custom);
    const command = editComponent(custom.id, {
      definitionKey: "custom.config",
      config: { nested: { value: 2 } },
    });
    const before = structuredClone({ input, command });
    const result = history(input, [command]);
    const config = result.document.scenes[0]!.objects[0]!.components[1]!
      .properties as { config: { nested: { value: number } } };
    config.config.nested.value = 3;
    expect({ input, command }).toEqual(before);
    expect(result.redo).toEqual([command]);
    expect(
      apply(populated(), [create(object("0030", 9))]).scenes[0]!.objects,
    ).toHaveLength(3);
    const undo = result.undo[0] as unknown as {
      properties: { config: { nested: { value: number } } };
    };
    undo.properties.config.nested.value = 4;
    expect({ input, command }).toEqual(before);
    expect(config.config.nested.value).toBe(3);
  });

  it("rejects malformed object/component commands and incomplete layer orders", () => {
    const input = populated();
    for (const command of [
      { ...remove(id("0010")), confirmed: false },
      remove(),
      remove(id("0010"), id("0010")),
      update({ id: id("0080") }),
      update({ components: [] }),
      update({ renderOrder: 1.5 }),
      { ...add(component("0012", "Health")), beforeComponentId: id("0099") },
      {
        ...create(object("0030", 8)),
        objects: [{ object: object("0030", 8), beforeObjectId: id("0099") }],
      },
      ...[
        [{ id: id("0010"), order: 0 }],
        [
          { id: id("0010"), order: 0 },
          { id: id("0020"), order: 0 },
        ],
        [
          { id: id("0010"), order: 0 },
          { id: id("0010"), order: 1 },
        ],
      ].map((orders) => ({
        type: "object.reorder",
        sceneId,
        layerId: id("0004"),
        orders,
      })),
    ])
      expect(() => apply(input, [command])).toThrow();
    expect(() =>
      apply(input, [create({ ...object("0030", 8), components: [] })]),
    ).toThrow(/Transform/);
  });

  it.each(["object", "layer", "scene"])(
    "replays a 131-component transitional %s carrier and rejects 132",
    (kind) => {
      const input = populated();
      const full = object("0030", 10);
      full.components.push(
        ...Array.from({ length: 130 }, (_, index) =>
          component(String(1000 + index), "Health"),
        ),
      );
      const carrier = () =>
        kind === "object"
          ? create(full)
          : kind === "layer"
            ? {
                type: "layer.create",
                sceneId,
                layer: {
                  ...input.scenes[0]!.layers[0]!,
                  id: id("0080"),
                  order: 8,
                },
                beforeLayerId: null,
                objects: [
                  {
                    object: { ...full, layerId: id("0080") },
                    beforeObjectId: null,
                  },
                ],
              }
            : {
                type: "scene.create",
                scene: {
                  ...input.scenes[1]!,
                  id: id("0080"),
                  key: "carrier",
                  order: 8,
                  layers: [{ ...input.scenes[1]!.layers[0]!, id: id("0081") }],
                  objects: [{ ...full, layerId: id("0081") }],
                },
                variables: null,
                beforeSceneId: null,
                entry: false,
              };
      expect(engine.ProjectMutation.safeParse(carrier()).success).toBe(true);
      const cleanup =
        kind === "object"
          ? remove(full.id)
          : kind === "layer"
            ? {
                type: "layer.delete",
                sceneId,
                layerId: id("0080"),
                confirmed: true,
              }
            : {
                type: "scene.delete",
                sceneId: id("0080"),
                replacementSceneId: null,
                confirmed: true,
              };
      roundTrip(input, [carrier(), cleanup, rename("Kept")]);
      full.components.push(component("1200", "Health"));
      expect(engine.ProjectMutation.safeParse(carrier()).success).toBe(false);
    },
  );

  it("rejects composed carriers beyond the component peak even if the object is later deleted", () => {
    const input = populated();
    const full = object("0030", 10);
    full.components.push(
      ...Array.from({ length: 130 }, (_, index) =>
        component(String(1000 + index), "Health"),
      ),
    );
    expect(() =>
      history(input, [
        create(full),
        add(component("1200", "Health"), full.id),
        remove(full.id),
      ]),
    ).toThrow("Atomic object components limit exceeded");
  });

  it("undoes a 100-command batch at the 131-component peak and final V2 stays canonical", () => {
    const input = populated();
    input.scenes[0]!.objects[0]!.components.push(
      ...Array.from({ length: 31 }, (_, index) =>
        component(String(1000 + index), "Health"),
      ),
    );
    const commands = [
      ...Array.from({ length: 99 }, (_, index) =>
        add(component(String(1100 + index), "Health")),
      ),
      remove(id("0010")),
    ];
    const result = roundTrip(input, commands);
    expect(result.undo).toHaveLength(100);
    expect(result.document.scenes[0]!.objects.map((value) => value.id)).toEqual(
      [id("0020")],
    );
  });
});

describe("V2 mutation batches", () => {
  it("addresses stable IDs when scene array order changes and preserves other fields", () => {
    const apply = reducer();
    const input = project();
    input.scenes.reverse();
    const result = apply(input, [rename("  New opening  ")]);
    const expected = structuredClone(input);
    expected.scenes[1]!.name = "New opening";
    expect(result).toEqual(expected);
  });

  it("applies commands in order without mutating the project or command inputs", () => {
    const apply = reducer();
    const input = project();
    const commands = [rename("First"), rename("Last")];
    const before = structuredClone({ input, commands });
    const result = apply(input, commands);
    expect(result.scenes[0]!.name).toBe("Last");
    expect({ input, commands }).toEqual(before);
    result.scenes[0]!.layers[0]!.name = "Detached";
    expect(input.scenes[0]!.layers[0]!.name).toBe("World");
  });

  it.each([
    { label: "empty", commands: [] },
    { label: "non-empty", commands: [rename("Renamed")] },
  ])(
    "detaches nested Custom prefab config for $label batches",
    ({ commands }) => {
      const input = project();
      input.prefabs.push({
        id: id("0006"),
        name: "Custom prefab",
        objectType: "CUSTOM",
        components: [
          {
            id: id("0007"),
            type: "Transform",
            version: 1,
            properties: {
              x: 0,
              y: 0,
              width: 32,
              height: 32,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
          },
          {
            id: id("0008"),
            type: "Custom",
            version: 1,
            properties: {
              definitionKey: "custom.settings",
              config: { nested: { value: 1 }, items: [{ value: 1 }] },
            },
          },
        ],
      });
      const before = structuredClone(input);

      const result = reducer()(input, commands);
      const { config } = result.prefabs[0]!.components[1]!.properties as {
        config: { nested: { value: number }; items: Array<{ value: number }> };
      };
      config.nested.value = 2;
      config.items[0]!.value = 3;

      expect(input).toEqual(before);
      expect(config).toEqual({ nested: { value: 2 }, items: [{ value: 3 }] });
    },
  );

  it("rejects missing targets atomically, including a failure after a valid command", () => {
    const apply = reducer();
    const input = project();
    const before = structuredClone(input);
    expect(() =>
      apply(input, [rename("Changed"), rename("Missing", id("0099"))]),
    ).toThrow();
    expect(input).toEqual(before);
  });

  it("rejects malformed commands without leaking partial changes", () => {
    const apply = reducer();
    const input = project();
    for (const command of [
      rename(" "),
      rename("x".repeat(81)),
      { ...rename("Changed"), path: "/scenes/0" },
      { type: "scene.delete", sceneId },
    ]) {
      expect(() =>
        apply(input, [rename("Earlier"), command] as never),
      ).toThrow();
    }
    expect(input.scenes[0]!.name).toBe("Opening");
  });

  it("checks whole-project semantics and leaves invalid source data untouched", () => {
    const apply = reducer();
    const input = project();
    input.entrySceneId = id("0099");
    const before = structuredClone(input);
    expect(() => apply(input, [rename("Changed")])).toThrow();
    expect(input).toEqual(before);
  });

  it("treats an empty local batch as a detached, unchanged document", () => {
    const apply = reducer();
    const input = project();
    expect(apply(input, [])).toEqual(input);
    expect(apply(input, [])).not.toBe(input);
  });
});

describe("scene and layer authoring", () => {
  const apply = (input: engine.EngineProjectV2Type, commands: unknown[]) =>
    engine.applyProjectMutations(input, commands as engine.ProjectMutation[]);
  const removeScene = (
    target = sceneId,
    replacement: string | null = id("0003"),
  ) => ({
    type: "scene.delete",
    sceneId: target,
    replacementSceneId: replacement,
    confirmed: true,
  });
  const removeLayer = (layerId = id("0006")) => ({
    type: "layer.delete",
    sceneId,
    layerId,
    confirmed: true,
  });
  function richProject() {
    const input = project();
    const scene = input.scenes[0]!;
    scene.layers.push({
      ...scene.layers[0]!,
      id: id("0006"),
      type: "COLLISION",
      order: 7,
    });
    scene.layers.push({
      ...scene.layers[0]!,
      id: id("0007"),
      type: "UI",
      order: 9,
    });
    input.variables.scene[sceneId] = [
      { id: id("0008"), name: "Visible", type: "BOOLEAN", initialValue: true },
    ];
    const component = (
      suffix: string,
      type: engine.V2ComponentType,
      properties?: unknown,
    ) => ({
      id: id(suffix),
      type,
      version: 1 as const,
      properties: properties ?? engine.v2ComponentRegistry[type].defaults(),
    });
    scene.objects = [
      {
        id: id("0010"),
        name: "Parent",
        objectType: "NPC",
        parentId: null,
        layerId: id("0004"),
        enabled: true,
        visible: true,
        locked: false,
        order: 8,
        renderOrder: 4,
        components: [
          component("0011", "Transform"),
          component("0012", "Dialogue", {
            startNodeId: id("0013"),
            nodes: [
              {
                id: id("0013"),
                speakerName: "NPC",
                avatarAssetId: null,
                text: sceneId,
                choices: [
                  {
                    id: id("0014"),
                    text: id("0010"),
                    conditionId: null,
                    eventId: id("0030"),
                  },
                ],
              },
            ],
          }),
          component("0015", "Collider", {
            ...(engine.v2ComponentRegistry.Collider.defaults() as object),
            collisionLayerId: id("0006"),
          }),
          component("0016", "MiniGame", {
            moduleId: null,
            returnSceneId: sceneId,
            resultEventId: id("0030"),
          }),
          component("0017", "Custom", {
            definitionKey: "custom.ids",
            config: { id: id("0010"), objectId: id("0010"), sceneId },
          }),
        ],
      },
      {
        id: id("0020"),
        name: "Child",
        objectType: "CUSTOM",
        parentId: id("0010"),
        layerId: id("0004"),
        enabled: true,
        visible: false,
        locked: true,
        order: 11,
        renderOrder: -3,
        components: [
          component("0021", "Transform"),
          component("0022", "Camera", {
            followObjectId: id("0010"),
            bounds: null,
            smoothing: 0,
          }),
        ],
      },
      {
        id: id("0023"),
        name: "UI",
        objectType: "UI",
        parentId: null,
        layerId: id("0007"),
        enabled: true,
        visible: true,
        locked: false,
        order: 0,
        renderOrder: 0,
        components: [
          component("0024", "Transform"),
          component("0025", "Text", {
            ...(engine.v2ComponentRegistry.Text.defaults() as object),
            visibilityVariable: {
              scope: "SCENE",
              sceneId,
              variableId: id("0008"),
            },
          }),
        ],
      },
    ];
    input.events = [
      {
        id: id("0030"),
        name: "Shared event",
        version: 1,
        enabled: true,
        order: 0,
        trigger: { type: "ON_START" },
        condition: null,
        steps: [{ id: id("0031"), version: 1, type: "COMPLETE_GAME" }],
      },
    ];
    return engine.EngineProjectV2.parse(input);
  }

  it("creates a scene, edits all settings, and orders by stable IDs with exact sparse order values", () => {
    const input = project();
    const scene = {
      ...structuredClone(input.scenes[0]!),
      id: id("0040"),
      key: "created",
      order: 15,
      layers: [{ ...input.scenes[0]!.layers[0]!, id: id("0041") }],
    };
    const result = apply(input, [
      {
        type: "scene.create",
        scene,
        variables: null,
        beforeSceneId: id("0003"),
        entry: false,
      },
      {
        type: "scene.update",
        sceneId: scene.id,
        changes: {
          type: "MAP",
          width: 900,
          height: 700,
          background: { color: "#abcdef", assetId: null },
          settings: {
            gravityX: -12,
            gravityY: 300,
            grid: { enabled: true, size: 48, snap: true },
          },
        },
      },
      {
        type: "scene.reorder",
        orders: [
          { id: sceneId, order: 50 },
          { id: id("0003"), order: 20 },
          { id: scene.id, order: 2 },
        ],
      },
      { type: "scene.entry", sceneId: scene.id },
    ]);
    expect(result.scenes.map(({ id }) => id)).toEqual([
      sceneId,
      id("0040"),
      id("0003"),
    ]);
    expect(result.entrySceneId).toBe(scene.id);
    expect(result.scenes[1]).toMatchObject({
      type: "MAP",
      order: 2,
      width: 900,
      height: 700,
      background: { color: "#abcdef", assetId: null },
      settings: {
        gravityX: -12,
        gravityY: 300,
        grid: { enabled: true, size: 48, snap: true },
      },
    });
    expect(input).toEqual(project());
    expect(
      engine.EngineProjectV2.parse(JSON.parse(JSON.stringify(result))),
    ).toEqual(result);
  });

  it("duplicates every owned ID and internal reference while sharing project resources and preserving opaque data", () => {
    const input = richProject();
    const command = {
      type: "scene.duplicate",
      sceneId,
      newId: id("0040"),
      name: "Copy",
      key: "copy",
    };
    const result = apply(input, [command]);
    const copy = result.scenes[2]!;
    expect(copy).toMatchObject({
      id: id("0040"),
      name: "Copy",
      key: "copy",
      order: 2,
      settings: input.scenes[0]!.settings,
    });
    const [parent, child, ui] = copy.objects;
    const dialogue = parent!.components[1]!.properties as {
      startNodeId: string;
      nodes: Array<{
        id: string;
        text: string;
        choices: Array<{ id: string; text: string; eventId: string }>;
      }>;
    };
    const originalIds = [
      sceneId,
      ...input.scenes[0]!.layers.map((x) => x.id),
      ...input.scenes[0]!.objects.flatMap((x) => [
        x.id,
        ...x.components.map((c) => c.id),
      ]),
      id("0013"),
      id("0014"),
      id("0008"),
    ];
    const copiedIds = [
      copy.id,
      ...copy.layers.map((x) => x.id),
      ...copy.objects.flatMap((x) => [x.id, ...x.components.map((c) => c.id)]),
      dialogue.nodes[0]!.id,
      dialogue.nodes[0]!.choices[0]!.id,
      result.variables.scene[copy.id]![0]!.id,
    ];
    expect(new Set(copiedIds).size).toBe(originalIds.length);
    expect(copiedIds.some((x) => originalIds.includes(x))).toBe(false);
    expect(child!.parentId).toBe(parent!.id);
    expect(parent!.layerId).toBe(copy.layers[0]!.id);
    expect(parent!.components[2]!.properties).toMatchObject({
      collisionLayerId: copy.layers[1]!.id,
    });
    expect(parent!.components[3]!.properties).toEqual({
      moduleId: null,
      returnSceneId: copy.id,
      resultEventId: id("0030"),
    });
    expect(child!.components[1]!.properties).toMatchObject({
      followObjectId: parent!.id,
    });
    expect(ui!.components[1]!.properties).toMatchObject({
      visibilityVariable: {
        scope: "SCENE",
        sceneId: copy.id,
        variableId: result.variables.scene[copy.id]![0]!.id,
      },
    });
    expect(dialogue.startNodeId).toBe(dialogue.nodes[0]!.id);
    expect(dialogue.nodes[0]).toMatchObject({
      text: sceneId,
      choices: [{ text: id("0010"), eventId: id("0030") }],
    });
    expect(parent!.components[4]!.properties).toEqual(
      input.scenes[0]!.objects[0]!.components[4]!.properties,
    );
    expect(result.events).toEqual(input.events);
    expect(apply(input, [command])).toEqual(result);
    expect(() => apply(result, [command])).toThrow();
  });

  it("requires confirmed deletion and explicit entry reassignment, removing owned scene variables", () => {
    const input = richProject();
    expect(() =>
      apply(input, [{ ...removeScene(), confirmed: false }]),
    ).toThrow();
    expect(() => apply(input, [removeScene(sceneId, null)])).toThrow();
    expect(() => apply(input, [removeScene(sceneId, sceneId)])).toThrow();
    const result = apply(input, [removeScene()]);
    expect(result.entrySceneId).toBe(id("0003"));
    expect(result.scenes.map((x) => x.id)).toEqual([id("0003")]);
    expect(result.variables.scene).toEqual({});
    expect(() => apply(result, [removeScene(id("0003"), null)])).toThrow();
  });

  it.each([
    "nested scene action",
    "nested condition",
    "scene variable",
    "dialogue choice",
    "script scene",
    "script object",
    "external component",
    "prefab",
  ])(
    "rejects scene deletion atomically when a %s reference would dangle",
    (kind) => {
      const input = richProject();
      const event = input.events[0]!;
      if (kind === "nested scene action")
        event.steps = [
          {
            id: id("0050"),
            version: 1,
            type: "REPEAT",
            times: 2,
            steps: [
              { id: id("0051"), version: 1, type: "CHANGE_SCENE", sceneId },
            ],
          },
        ];
      if (kind === "nested condition")
        event.condition = {
          id: id("0050"),
          version: 1,
          type: "NOT",
          condition: {
            id: id("0051"),
            version: 1,
            type: "HAS_COMPONENT",
            objectId: id("0010"),
            componentId: id("0011"),
          },
        };
      if (kind === "scene variable")
        event.trigger = {
          type: "ON_VARIABLE_CHANGED",
          variable: { scope: "SCENE", sceneId, variableId: id("0008") },
        };
      if (kind === "dialogue choice")
        event.trigger = {
          type: "ON_CHOICE_SELECTED",
          objectId: id("0010"),
          componentId: id("0012"),
          choiceId: id("0014"),
        };
      if (kind.startsWith("script"))
        input.scripts = [
          {
            id: id("0050"),
            version: 1,
            name: "External",
            language: "JAVASCRIPT",
            source: "",
            capabilities: [],
            attachments: [
              kind === "script scene"
                ? { id: id("0051"), type: "SCENE", sceneId }
                : { id: id("0051"), type: "OBJECT", objectId: id("0010") },
            ],
          },
        ];
      if (kind === "external component")
        input.scenes[1]!.objects = [
          {
            ...structuredClone(input.scenes[0]!.objects[0]!),
            id: id("0060"),
            parentId: null,
            layerId: id("0005"),
            components: [
              {
                ...input.scenes[0]!.objects[0]!.components[0]!,
                id: id("0061"),
              },
              {
                ...input.scenes[0]!.objects[0]!.components[3]!,
                id: id("0062"),
              },
            ],
          },
        ];
      if (kind === "prefab")
        input.prefabs = [
          {
            id: id("0060"),
            name: "External",
            objectType: "CUSTOM",
            components: [
              {
                ...input.scenes[0]!.objects[0]!.components[0]!,
                id: id("0061"),
              },
              {
                ...input.scenes[0]!.objects[0]!.components[3]!,
                id: id("0062"),
              },
            ],
          },
        ];
      expect(engine.EngineProjectV2.safeParse(input).success).toBe(true);
      const before = structuredClone(input);
      expect(() => apply(input, [rename("Earlier"), removeScene()])).toThrow(
        /references|scope/,
      );
      expect(input).toEqual(before);
    },
  );

  it("creates, renames, changes type/visibility/lock, reorders and deletes layers", () => {
    const input = project();
    const layer = { ...input.scenes[0]!.layers[0]!, id: id("0006"), order: 4 };
    const result = apply(input, [
      {
        type: "layer.create",
        sceneId,
        layer,
        objects: [],
        beforeLayerId: id("0004"),
      },
      {
        type: "layer.update",
        sceneId,
        layerId: layer.id,
        changes: { name: "HUD", type: "UI", visible: false, locked: true },
      },
      {
        type: "layer.reorder",
        sceneId,
        orders: [
          { id: layer.id, order: 0 },
          { id: id("0004"), order: 7 },
        ],
      },
    ]);
    expect(result.scenes[0]!.layers).toEqual([
      {
        ...layer,
        name: "HUD",
        type: "UI",
        order: 0,
        visible: false,
        locked: true,
      },
      { ...input.scenes[0]!.layers[0]!, order: 7 },
    ]);
    const deleted = apply(result, [removeLayer()]);
    expect(deleted.scenes[0]!.layers).toHaveLength(1);
    expect(() => apply(deleted, [removeLayer(id("0004"))])).toThrow();
    expect(() =>
      apply(result, [{ ...removeLayer(), confirmed: false }]),
    ).toThrow();
  });

  it("duplicates the layer object subtree and keeps references to other layers/scenes shared", () => {
    const input = richProject();
    const result = apply(input, [
      {
        type: "layer.duplicate",
        sceneId,
        layerId: id("0004"),
        newId: id("0040"),
        name: "World copy",
      },
    ]);
    const scene = result.scenes[0]!;
    expect(scene.layers[3]).toMatchObject({
      id: id("0040"),
      name: "World copy",
      order: 10,
    });
    const [parent, child] = scene.objects.slice(3);
    expect(parent!.id).not.toBe(id("0010"));
    expect(child!.parentId).toBe(parent!.id);
    expect(child!.layerId).toBe(id("0040"));
    expect(parent!.components[2]!.properties).toMatchObject({
      collisionLayerId: id("0006"),
    });
    expect(parent!.components[3]!.properties).toMatchObject({
      returnSceneId: sceneId,
    });
    expect(parent!.components[1]!.id).not.toBe(id("0012"));
    const dialogue = parent!.components[1]!.properties as {
      startNodeId: string;
      nodes: Array<{ id: string; choices: Array<{ id: string }> }>;
    };
    expect(dialogue.startNodeId).toBe(dialogue.nodes[0]!.id);
    expect(dialogue.nodes[0]!.id).not.toBe(id("0013"));
    expect(dialogue.nodes[0]!.choices[0]!.id).not.toBe(id("0014"));
    expect(apply(result, [removeLayer(id("0040"))])).toEqual(input);
  });

  it("rejects dangling collider/parent references and incompatible layer type edits", () => {
    const input = richProject();
    expect(() => apply(input, [removeLayer()])).toThrow(/references/);
    expect(() =>
      apply(input, [
        {
          type: "layer.update",
          sceneId,
          layerId: id("0007"),
          changes: { type: "WORLD" },
        },
      ]),
    ).toThrow(/compatible/);
    input.scenes[0]!.objects[2]!.parentId = id("0010");
    expect(() => apply(input, [removeLayer(id("0004"))])).toThrow(/parent/);
  });

  it("rejects incomplete, repeated, foreign and colliding reorder IDs", () => {
    for (const orders of [
      [{ id: sceneId, order: 0 }],
      [
        { id: sceneId, order: 0 },
        { id: sceneId, order: 1 },
      ],
      [
        { id: sceneId, order: 0 },
        { id: id("0099"), order: 1 },
      ],
      [
        { id: sceneId, order: 0 },
        { id: id("0003"), order: 0 },
      ],
    ]) {
      expect(() =>
        apply(project(), [{ type: "scene.reorder", orders }]),
      ).toThrow(/order/i);
    }
  });

  it("keeps the original create payload in history when later commands edit the created layer", () => {
    const input = project();
    const layer = { ...input.scenes[0]!.layers[0]!, id: id("0006"), order: 5 };
    const commands: engine.ProjectMutation[] = [
      {
        type: "layer.create",
        sceneId,
        layer,
        objects: [],
        beforeLayerId: null,
      },
      {
        type: "layer.update",
        sceneId,
        layerId: layer.id,
        changes: { name: "Edited" },
      },
    ];
    const result = engine.applyProjectMutationsWithHistory(input, commands);
    expect(result.redo).toEqual(commands);
    expect(apply(result.document, result.undo)).toEqual(input);
  });

  it("keeps legacy-upgraded scene copies valid and restores the exact upgraded document", () => {
    const legacy = engine.EngineProjectV1.parse(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/v1-project.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    const input = engine.EngineProjectV2.parse(
      engine.upgradeEngineProjectV1(legacy),
    );
    const result = engine.applyProjectMutationsWithHistory(input, [
      {
        type: "scene.duplicate",
        sceneId: input.entrySceneId,
        newId: id("0090"),
        name: "Legacy copy",
        key: "legacy-copy",
      },
    ]);
    expect(
      engine.EngineProjectV2.parse(JSON.parse(JSON.stringify(result.document))),
    ).toEqual(result.document);
    expect(result.document.events).toEqual(input.events);
    expect(result.document.scenes.at(-1)!.objects.length).toBe(
      input.scenes.find((x) => x.id === input.entrySceneId)!.objects.length,
    );
    expect(apply(result.document, result.undo)).toEqual(input);
  });

  it("undoes a valid delete batch whose intermediate scene has an orphaned child", () => {
    const input = richProject();
    input.scenes[0]!.objects[2]!.parentId = id("0010");
    const result = engine.applyProjectMutationsWithHistory(input, [
      { type: "layer.delete", sceneId, layerId: id("0004"), confirmed: true },
      {
        type: "scene.delete",
        sceneId,
        replacementSceneId: id("0003"),
        confirmed: true,
      },
    ]);
    expect(result.document.scenes.map((scene) => scene.id)).toEqual([
      id("0003"),
    ]);
    expect(apply(result.document, result.undo)).toEqual(input);
  });

  it.each(["layers", "objects"] as const)(
    "replays canonical mixed undo/redo when a deleted scene temporarily exceeds its %s limit",
    (collection) => {
      const input = project();
      const scene = input.scenes[0]!;
      if (collection === "layers") {
        scene.layers = Array.from({ length: 100 }, (_, order) => ({
          ...scene.layers[0]!,
          id: id(String(1000 + order)),
          order,
        }));
      }
      const object = (
        suffix: number,
        layerId: string,
        order: number,
      ): engine.GameObjectV2Type => ({
        id: id(String(suffix)),
        name: "Object",
        objectType: "CUSTOM",
        parentId: null,
        layerId,
        enabled: true,
        visible: true,
        locked: false,
        order,
        renderOrder: 0,
        components: [
          {
            id: id(String(suffix + 2000)),
            type: "Transform",
            version: 1,
            properties: engine.v2ComponentRegistry.Transform.defaults(),
          },
        ],
      });
      if (collection === "objects") {
        scene.objects = Array.from({ length: 1000 }, (_, order) =>
          object(2000 + order, scene.layers[0]!.id, order),
        );
      }
      const before = engine.EngineProjectV2.parse(input);
      const layer = { ...scene.layers[0]!, id: id("7000"), order: 100 };
      const commands: engine.ProjectMutation[] = [
        {
          type: "layer.create",
          sceneId,
          layer,
          beforeLayerId: null,
          objects:
            collection === "objects"
              ? [{ object: object(6000, layer.id, 0), beforeObjectId: null }]
              : [],
        },
        {
          type: "layer.update",
          sceneId,
          layerId: layer.id,
          changes: { name: "Temporary" },
        },
        {
          type: "scene.delete",
          sceneId,
          replacementSceneId: id("0003"),
          confirmed: true,
        },
        { type: "scene.rename", sceneId: id("0003"), name: "Kept" },
      ];
      const result = engine.applyProjectMutationsWithHistory(before, commands);
      expect(result.document.scenes).toHaveLength(1);
      expect(result.document.scenes[0]!.name).toBe("Kept");
      const inverse = engine.ProjectMutation.array().parse(result.undo);
      const restored = engine.applyProjectMutationsWithHistory(
        result.document,
        inverse,
      );
      expect(restored.document).toEqual(before);
      expect(
        apply(before, engine.ProjectMutation.array().parse(result.redo)),
      ).toEqual(result.document);
      expect(
        apply(before, engine.ProjectMutation.array().parse(restored.undo)),
      ).toEqual(result.document);
    },
  );

  it.each(["scene layers", "scene objects", "layer objects"])(
    "bounds the %s transition carrier at the reachable atomic capacity",
    (collection) => {
      const scene = project().scenes[0]!;
      // Structural carriers may be temporarily non-canonical. Element shapes
      // stay strict; the complete batch still validates transforms/IDs/references.
      const object: engine.GameObjectV2Type = {
        id: id("0010"),
        name: "Object",
        objectType: "CUSTOM",
        parentId: null,
        layerId: scene.layers[0]!.id,
        enabled: true,
        visible: true,
        locked: false,
        order: 0,
        renderOrder: 0,
        components: [],
      };
      const maximum = collection === "scene layers" ? 199 : 100_000;
      const command = (count: number) =>
        collection === "layer objects"
          ? {
              type: "layer.create",
              sceneId,
              layer: scene.layers[0],
              beforeLayerId: null,
              objects: Array.from({ length: count }, () => ({
                object,
                beforeObjectId: null,
              })),
            }
          : {
              type: "scene.create",
              scene: {
                ...scene,
                layers:
                  collection === "scene layers"
                    ? Array.from({ length: count }, () => scene.layers[0])
                    : scene.layers,
                objects:
                  collection === "scene objects"
                    ? Array.from({ length: count }, () => object)
                    : [],
              },
              variables: null,
              beforeSceneId: null,
              entry: false,
            };
      expect(engine.ProjectMutation.safeParse(command(maximum)).success).toBe(
        true,
      );
      expect(
        engine.ProjectMutation.safeParse(command(maximum + 1)).success,
      ).toBe(false);
    },
    20_000,
  );

  it("restores a temporarily oversized layer-owned object snapshot through mixed history", () => {
    const before = project();
    const scene = {
      ...before.scenes[0]!,
      id: id("0010"),
      key: "carrier",
      order: 2,
      layers: [10, 11].map((order) => ({
        ...before.scenes[0]!.layers[0]!,
        id: id(String(1000 + order)),
        order,
      })),
      objects: Array.from({ length: 1001 }, (_, order) => ({
        id: id(String(2000 + order)),
        name: "Object",
        objectType: "CUSTOM" as const,
        parentId: null,
        layerId: id("1010"),
        enabled: true,
        visible: true,
        locked: false,
        order,
        renderOrder: 0,
        components: [
          {
            id: id(String(4000 + order)),
            type: "Transform" as const,
            version: 1 as const,
            properties: engine.v2ComponentRegistry.Transform.defaults(),
          },
        ],
      })),
    };
    const result = engine.applyProjectMutationsWithHistory(before, [
      {
        type: "scene.create",
        scene,
        variables: null,
        beforeSceneId: null,
        entry: false,
      },
      {
        type: "layer.delete",
        sceneId: scene.id,
        layerId: id("1010"),
        confirmed: true,
      },
      {
        type: "scene.delete",
        sceneId: scene.id,
        replacementSceneId: null,
        confirmed: true,
      },
      rename("Kept"),
    ]);
    const inverse = engine.ProjectMutation.array().parse(result.undo);
    const restore = inverse.find((command) => command.type === "layer.create");
    expect(restore?.type === "layer.create" && restore.objects.length).toBe(
      1001,
    );
    expect(apply(result.document, inverse)).toEqual(before);
    expect(apply(before, result.redo)).toEqual(result.document);
  });

  it("replays the exact reachable 199-layer peak within the 100-command protocol", () => {
    const before = project();
    const scene = before.scenes[0]!;
    scene.layers = Array.from({ length: 100 }, (_, order) => ({
      ...scene.layers[0]!,
      id: id(String(1000 + order)),
      order,
    }));
    const commands: engine.ProjectMutation[] = [
      ...Array.from({ length: 99 }, (_, order) => ({
        type: "layer.create" as const,
        sceneId,
        layer: {
          ...scene.layers[0]!,
          id: id(String(2000 + order)),
          order: 100 + order,
        },
        objects: [],
        beforeLayerId: null,
      })),
      {
        type: "scene.delete",
        sceneId,
        replacementSceneId: id("0003"),
        confirmed: true,
      },
    ];
    const result = engine.applyProjectMutationsWithHistory(before, commands);
    expect(result.undo).toHaveLength(100);
    expect(
      apply(result.document, engine.ProjectMutation.array().parse(result.undo)),
    ).toEqual(before);
    expect(apply(before, result.redo)).toEqual(result.document);
  });

  it.each(["layers", "objects"] as const)(
    "rejects composed carriers beyond the atomic %s capacity even when later deleted",
    (collection) => {
      const before = project();
      const scene = {
        ...before.scenes[0]!,
        id: id("0010"),
        key: "carrier",
        order: 2,
      };
      const object: engine.GameObjectV2Type = {
        id: id("0020"),
        name: "Object",
        objectType: "CUSTOM",
        parentId: null,
        layerId: scene.layers[0]!.id,
        enabled: true,
        visible: true,
        locked: false,
        order: 0,
        renderOrder: 0,
        components: [],
      };
      if (collection === "layers")
        scene.layers = Array.from({ length: 199 }, () => scene.layers[0]!);
      else scene.objects = Array.from({ length: 100_000 }, () => object);
      expect(() =>
        apply(before, [
          {
            type: "scene.create",
            scene,
            variables: null,
            beforeSceneId: null,
            entry: false,
          },
          {
            type: "layer.create",
            sceneId: scene.id,
            layer: { ...scene.layers[0]!, id: id("0030"), order: 200 },
            beforeLayerId: null,
            objects:
              collection === "objects"
                ? [
                    {
                      object: {
                        ...object,
                        id: id("0031"),
                        layerId: id("0030"),
                      },
                      beforeObjectId: null,
                    },
                  ]
                : [],
          },
          removeScene(scene.id, null),
        ]),
      ).toThrow(`Atomic scene ${collection} limit exceeded`);
    },
    20_000,
  );
});
