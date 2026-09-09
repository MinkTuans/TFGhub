import { describe, expect, it } from "vitest";
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
