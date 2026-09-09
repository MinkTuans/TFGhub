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
});
