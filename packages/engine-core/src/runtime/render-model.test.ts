import { describe, expect, it } from "vitest";
import * as engine from "../index.js";

const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const component = (
  n: number,
  type: engine.V2ComponentType,
  properties = {},
) => ({
  id: id(n),
  type,
  version: 1 as const,
  properties: {
    ...(engine.v2ComponentRegistry[type].defaults() as object),
    ...properties,
  },
});
const object = (
  n: number,
  changes: Partial<engine.GameObjectV2Type> = {},
): engine.GameObjectV2Type => ({
  id: id(n),
  name: `Object ${n}`,
  objectType: "DECORATION",
  parentId: null,
  layerId: id(2),
  enabled: true,
  visible: true,
  locked: false,
  order: n,
  renderOrder: 0,
  components: [
    component(n + 1000, "Transform"),
    component(n + 2000, "SpriteRenderer"),
  ],
  ...changes,
});
const scene = (objects = [object(10)]): engine.SceneV2Type => ({
  id: id(1),
  name: "Scene",
  key: "scene",
  order: 0,
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
      id: id(2),
      name: "World",
      order: 0,
      type: "WORLD",
      visible: true,
      locked: false,
    },
  ],
  objects,
});
function model() {
  expect(engine, "The canonical render model must be exported").toHaveProperty(
    "buildRenderList",
  );
  return engine.buildRenderList;
}
function freeze(value: unknown) {
  if (!value || typeof value !== "object") return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}

describe("canonical render model", () => {
  it("sorts by explicit layer, render, and object orders even when physical storage is reversed", () => {
    const input = scene([
      object(10, { order: 9, renderOrder: -1 }),
      object(11, { order: 0, renderOrder: 2 }),
      object(12, { layerId: id(3), order: 0, renderOrder: -100 }),
      object(13, { order: 1, renderOrder: -1 }),
    ]);
    input.layers.unshift({
      ...input.layers[0]!,
      id: id(3),
      type: "UI",
      order: 20,
    });
    const build = model();
    expect(build(input).map((item) => item.objectId)).toEqual([
      id(13),
      id(10),
      id(11),
      id(12),
    ]);
    expect(
      build({
        ...input,
        layers: [...input.layers].reverse(),
        objects: [...input.objects].reverse(),
      }),
    ).toEqual(build(input));
  });

  it("uses stable IDs for a defensive complete order tie, never physical array order", () => {
    const input = scene([object(11, { order: 0 }), object(10, { order: 0 })]);
    expect(model()(input).map((item) => item.objectId)).toEqual([
      id(10),
      id(11),
    ]);
  });

  it.each(["visible", "enabled"] as const)(
    "omits a %s=false subtree even with forward cross-layer parent references",
    (flag) => {
      const input = scene([
        object(11, { parentId: id(10), layerId: id(3) }),
        object(10, { [flag]: false }),
      ]);
      input.layers.push({ ...input.layers[0]!, id: id(3), order: 1 });
      expect(model()(input)).toEqual([]);
    },
  );

  it("omits hidden layers and their cross-layer descendants", () => {
    const input = scene([
      object(10),
      object(11, { layerId: id(3), parentId: id(10) }),
      object(12, { layerId: id(3) }),
    ]);
    input.layers[0]!.visible = false;
    input.layers.push({
      ...input.layers[0]!,
      id: id(3),
      order: 1,
      visible: true,
    });
    expect(model()(input).map((item) => item.objectId)).toEqual([id(12)]);
  });

  it("retains locked objects and inherited lock metadata without altering their rendering geometry", () => {
    const input = scene([
      object(11, { parentId: id(10) }),
      object(10, { locked: true }),
    ]);
    const build = model();
    const locked = build(input);
    expect(locked).toHaveLength(2);
    expect(locked.map((item) => item.locked)).toEqual([true, true]);
    input.objects[1]!.locked = false;
    input.layers[0]!.locked = true;
    expect(build(input)).toEqual(locked);
    input.layers[0]!.locked = false;
    expect(build(input).map(({ locked: _locked, ...item }) => item)).toEqual(
      locked.map(({ locked: _locked, ...item }) => item),
    );
  });

  it("rotates clockwise in degrees around the default center pivot and computes transformed bounds", () => {
    const input = scene([
      object(10, {
        components: [
          component(1010, "Transform", {
            x: 100,
            y: 50,
            width: 20,
            height: 10,
            rotation: 90,
          }),
          component(2010, "SpriteRenderer"),
        ],
      }),
    ]);
    const [item] = model()(input);
    [0, 1, -1, 0, 115, 45].forEach((value, index) =>
      expect(item!.matrix[index]).toBeCloseTo(value),
    );
    expect(item!.bounds).toEqual({ x: 105, y: 45, width: 10, height: 20 });
    expect(item!.width).toBe(20);
    expect(item!.height).toBe(10);
  });

  it("composes parentWorld × local with explicit pivots, rotation, and negative scale", () => {
    const input = scene([
      object(11, {
        parentId: id(10),
        components: [
          component(1011, "Transform", {
            x: 3,
            y: 4,
            width: 10,
            height: 6,
            scaleX: -1,
            pivot: { x: 0, y: 0 },
          }),
          component(2011, "SpriteRenderer"),
        ],
      }),
      object(10, {
        components: [
          component(1010, "Transform", {
            x: 100,
            y: 50,
            rotation: 90,
            scaleX: 2,
            scaleY: 3,
            pivot: { x: 0, y: 0 },
          }),
        ],
      }),
    ]);
    const item = model()(input).find((item) => item.objectId === id(11))!;
    [0, -2, -3, 0, 88, 56].forEach((value, index) =>
      expect(item.matrix[index]).toBeCloseTo(value),
    );
    expect(item.bounds.x).toBeCloseTo(70);
    expect(item.bounds.y).toBeCloseTo(36);
    expect(item.bounds.width).toBeCloseTo(18);
    expect(item.bounds.height).toBeCloseTo(20);
    expect(input.objects[0]!.components[0]!.properties).toMatchObject({
      x: 3,
      y: 4,
    });
  });

  it("keeps image, text, shape, tile, UI and custom-effect placeholders as separate data primitives", () => {
    const input = scene([
      object(10, {
        components: [
          component(1010, "Transform"),
          component(2010, "SpriteRenderer", {
            assetId: id(90),
            frame: "idle",
            opacity: 0.5,
            flipX: true,
          }),
          component(3010, "Tilemap", { tiles: [{ x: 0, y: 0, tile: 4 }] }),
          component(4010, "Custom", { definitionKey: "effect.sparkles" }),
        ],
      }),
      object(11, {
        layerId: id(3),
        objectType: "UI",
        components: [
          component(1011, "Transform"),
          component(2011, "UIPanel", { backgroundColor: "#ff0000" }),
          component(3011, "Text", { text: "Score", align: "RIGHT" }),
          component(4011, "UIImage"),
        ],
      }),
    ]);
    input.layers.push({ ...input.layers[0]!, id: id(3), order: 1, type: "UI" });
    const items = model()(engine.SceneV2.parse(input));
    expect(items[0]!.primitives).toMatchObject([
      {
        kind: "image",
        componentId: id(2010),
        assetId: id(90),
        frame: "idle",
        opacity: 0.5,
        flipX: true,
      },
      {
        kind: "tiles",
        componentId: id(3010),
        tiles: [{ x: 0, y: 0, tile: 4 }],
      },
      { kind: "placeholder", componentId: id(4010), label: "effect.sparkles" },
    ]);
    expect(items[1]!).toMatchObject({
      layerType: "UI",
      primitives: [
        { kind: "shape", color: "#ff0000" },
        { kind: "text", text: "Score", align: "RIGHT" },
        { kind: "image" },
      ],
    });
  });

  it("suppresses hidden or transparent render components without inventing placeholder graphics", () => {
    const input = scene([
      object(10, {
        components: [
          component(1010, "Transform"),
          component(2010, "SpriteRenderer", { visible: false }),
          component(3010, "SpriteRenderer", { opacity: 0 }),
        ],
      }),
    ]);
    expect(model()(input)[0]!.primitives).toEqual([]);
  });

  it("projects legacy rectangles, collision shapes and UI buttons without executing custom code", () => {
    const input = scene([
      object(10, {
        components: [
          component(1010, "Transform"),
          component(2010, "Custom", {
            definitionKey: "tfg.v1.shape",
            config: {
              kind: "RECTANGLE",
              width: 20,
              height: 10,
              color: "#abcdef",
            },
          }),
        ],
      }),
      object(11, {
        layerId: id(3),
        components: [
          component(1011, "Transform"),
          {
            id: id(2011),
            type: "Collider",
            version: 1,
            properties: {
              shape: "CIRCLE",
              radius: 5,
              offsetX: 2,
              offsetY: 3,
              isTrigger: false,
              collisionLayerId: null,
            },
          },
        ],
      }),
      object(12, {
        layerId: id(4),
        components: [
          component(1012, "Transform"),
          component(2012, "UIButton", { label: "Start", enabled: false }),
        ],
      }),
    ]);
    input.layers.push(
      { ...input.layers[0]!, id: id(3), order: 1, type: "COLLISION" },
      { ...input.layers[0]!, id: id(4), order: 2, type: "UI" },
    );
    const list = model()(engine.SceneV2.parse(input));
    expect(list[0]!.primitives).toMatchObject([
      {
        kind: "shape",
        shape: "rectangle",
        width: 20,
        height: 10,
        color: "#abcdef",
      },
    ]);
    expect(list[1]!.primitives).toMatchObject([
      { kind: "shape", shape: "ellipse", x: 2, y: 3, width: 10, height: 10 },
    ]);
    expect(list[2]!.primitives).toMatchObject([
      { kind: "shape" },
      { kind: "text", text: "Start", align: "CENTER" },
    ]);
  });

  it("omits non-finite composed geometry from otherwise bounded local transforms", () => {
    const input = scene(
      Array.from({ length: 110 }, (_, index) =>
        object(index + 10, {
          parentId: index ? id(index + 9) : null,
          components: [
            component(index + 2000, "Transform", {
              scaleX: 1000,
              scaleY: 1000,
            }),
            component(index + 4000, "SpriteRenderer"),
          ],
        }),
      ),
    );
    const list = model()(input);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(110);
    expect(
      list.every((item) =>
        [...item.matrix, ...Object.values(item.bounds)].every(Number.isFinite),
      ),
    ).toBe(true);
  });

  it("does not retain mutable canonical component data or modify frozen input", () => {
    const input = engine.SceneV2.parse(
      scene([
        object(10, {
          components: [
            component(1010, "Transform"),
            component(2010, "Tilemap", { tiles: [{ x: 0, y: 0, tile: 4 }] }),
          ],
        }),
      ]),
    );
    const before = JSON.stringify(input);
    freeze(input);
    const build = model();
    const first = build(input);
    expect(build(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(first[0]!.primitives[0]).not.toBe(
      input.objects[0]!.components[1]!.properties,
    );
    const primitive = first[0]!.primitives[0];
    if (primitive?.kind === "tiles")
      expect(primitive.tiles).not.toBe(
        input.objects[0]!.components[1]!.properties.tiles,
      );
  });

  it("handles a bounded 1,000-object deep hierarchy without recursion failure or input changes", () => {
    const input = scene(
      Array.from({ length: 1000 }, (_, index) =>
        object(index + 10, {
          parentId: index ? id(index + 9) : null,
          components: [
            component(index + 2000, "Transform", { x: 1, width: 2, height: 2 }),
            component(index + 4000, "SpriteRenderer"),
          ],
        }),
      ).reverse(),
    );
    engine.SceneV2.parse(input);
    const build = model();
    const list = build(input);
    expect(list).toHaveLength(1000);
    expect(list[999]!.objectId).toBe(id(1009));
    expect(list[999]!.bounds).toEqual({ x: 1000, y: 0, width: 2, height: 2 });
  });
});
