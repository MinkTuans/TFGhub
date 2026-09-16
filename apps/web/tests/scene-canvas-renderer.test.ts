import { describe, expect, it } from "vitest";
import {
  buildRenderList,
  EngineProjectV2,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { recordingContext } from "./canvas-context";

const files = import.meta.glob("../components/studio/canvas/*.ts");
async function coordinates() {
  expect(files, "Pure canvas coordinates are missing").toHaveProperty([
    "../components/studio/canvas/coordinates.ts",
  ]);
  return (await files[
    "../components/studio/canvas/coordinates.ts"
  ]()) as typeof import("../components/studio/canvas/coordinates");
}
async function renderer() {
  expect(files, "The Canvas2D scene renderer is missing").toHaveProperty([
    "../components/studio/canvas/scene-renderer.ts",
  ]);
  return (await files[
    "../components/studio/canvas/scene-renderer.ts"
  ]()) as typeof import("../components/studio/canvas/scene-renderer");
}
async function hits() {
  expect(files, "Editor hit testing is missing").toHaveProperty([
    "../components/studio/canvas/hit-test.ts",
  ]);
  return (await files[
    "../components/studio/canvas/hit-test.ts"
  ]()) as typeof import("../components/studio/canvas/hit-test");
}
const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const camera = {
  x: 10,
  y: 20,
  zoom: 2,
  viewportWidth: 320,
  viewportHeight: 180,
};
type Scene = EngineProjectV2Type["scenes"][number];
const component = (
  n: number,
  type: Scene["objects"][number]["components"][number]["type"],
  properties = {},
) => ({
  id: id(n),
  type,
  version: 1 as const,
  properties: {
    ...(v2ComponentRegistry[type].defaults() as object),
    ...properties,
  },
});
function scene(): Scene {
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [id(90)],
    scenes: [
      {
        id: id(2),
        name: "Scene",
        key: "scene",
        type: "MIXED",
        order: 0,
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
            id: id(3),
            name: "World",
            type: "WORLD",
            order: 0,
            visible: true,
            locked: false,
          },
        ],
        objects: [0, 1].map((index) => ({
          id: id(10 + index),
          name: `Object ${index}`,
          objectType: "DECORATION",
          parentId: null,
          layerId: id(3),
          enabled: true,
          visible: true,
          locked: false,
          order: index,
          renderOrder: index,
          components: [
            component(20 + index, "Transform", {
              x: 100,
              y: 50,
              width: 20,
              height: 10,
            }),
            component(30 + index, "SpriteRenderer", { assetId: id(90) }),
          ],
        })),
      },
    ],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  }).scenes[0];
}

describe("canvas coordinates", () => {
  it("converts between CSS viewport pixels and world coordinates without mixing device pixels", async () => {
    const { worldToScreen, screenToWorld, clientToWorld } = await coordinates();
    expect(worldToScreen({ x: 14, y: 23 }, camera)).toEqual({ x: 8, y: 6 });
    expect(screenToWorld({ x: 8, y: 6 }, camera)).toEqual({ x: 14, y: 23 });
    expect(
      clientToWorld(
        { x: 116, y: 212 },
        { left: 100, top: 200, width: 640, height: 360 },
        camera,
      ),
    ).toEqual({ x: 14, y: 23 });
    const fractional = { ...camera, x: -9.25, y: 0.125, zoom: 0.3 };
    const restored = screenToWorld(
      worldToScreen({ x: -133.5, y: 900.125 }, fractional),
      fractional,
    );
    expect(restored.x).toBeCloseTo(-133.5);
    expect(restored.y).toBeCloseTo(900.125);
  });

  it.each([
    { zoom: 0 },
    { zoom: -1 },
    { zoom: NaN },
    { zoom: Infinity },
    { x: NaN },
    { y: Infinity },
    { viewportWidth: 0 },
    { viewportHeight: -1 },
    { viewportWidth: Infinity },
  ])(
    "rejects invalid cameras %j before coordinates or canvas writes",
    async (change) => {
      const { worldToScreen, screenToWorld } = await coordinates();
      const { renderScene } = await renderer();
      const invalid = { ...camera, ...change };
      const { context, calls } = recordingContext();
      expect(() => worldToScreen({ x: 1, y: 1 }, invalid)).toThrow(RangeError);
      expect(() => screenToWorld({ x: 1, y: 1 }, invalid)).toThrow(RangeError);
      expect(() => renderScene(context, [], invalid)).toThrow(RangeError);
      expect(calls).toEqual([]);
    },
  );

  it("rejects invalid points, CSS bounds and overflowing conversions", async () => {
    const { worldToScreen, clientToWorld } = await coordinates();
    expect(() => worldToScreen({ x: Infinity, y: 1 }, camera)).toThrow(
      RangeError,
    );
    expect(() =>
      worldToScreen({ x: 1e308, y: 1 }, { ...camera, zoom: 1e308 }),
    ).toThrow(RangeError);
    expect(() =>
      clientToWorld(
        { x: 0, y: 0 },
        { left: 0, top: 0, width: 0, height: 1 },
        camera,
      ),
    ).toThrow(RangeError);
  });
});

describe("Canvas2D scene drawing", () => {
  it("clears the backing buffer, clips the CSS viewport and scene, then applies camera and DPR exactly once", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    const { context, calls, stack, state } = recordingContext(640, 360);
    renderScene(context, buildRenderList(source), camera, {
      pixelRatio: 2,
      surface: source,
    });
    expect(calls.slice(0, 3)).toEqual([
      { name: "save", args: [] },
      { name: "setTransform", args: [1, 0, 0, 1, 0, 0] },
      { name: "clearRect", args: [0, 0, 640, 360] },
    ]);
    expect(calls).toContainEqual({ name: "rect", args: [0, 0, 640, 360] });
    expect(calls).toContainEqual({
      name: "setTransform",
      args: [4, 0, 0, 4, -40, -80],
    });
    expect(calls).toContainEqual({ name: "rect", args: [0, 0, 640, 480] });
    expect(
      calls.filter((call) => call.name === "clip").length,
    ).toBeGreaterThanOrEqual(2);
    expect(calls).toContainEqual({ name: "fillStyle", args: ["#102030"] });
    expect(stack).toEqual([]);
    expect(state.globalAlpha).toBe(1);
  });

  it("draws absent/broken images as bounded placeholders and restores opacity between components", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    source.objects[0].components[1].properties.opacity = 0.25;
    const list = buildRenderList(source);
    const { context, calls } = recordingContext();
    renderScene(context, list, camera, {
      images: new Map([
        [id(90), { complete: false, naturalWidth: 0 } as HTMLImageElement],
      ]),
    });
    expect(calls.filter((call) => call.name === "drawImage")).toEqual([]);
    expect(calls.filter((call) => call.name === "fillRect")).toHaveLength(2);
    expect(
      calls
        .filter((call) => call.name === "globalAlpha")
        .map((call) => call.args[0]),
    ).toEqual([1, 0.25, 1]);
    expect(calls).toContainEqual({ name: "rect", args: [0, 0, 20, 10] });
    expect(calls).toContainEqual({ name: "stroke", args: [] });
  });

  it("renders reserved pixel frames without missing-asset placeholders", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    source.objects = [source.objects[0]];
    Object.assign(source.objects[0].components[1].properties, {assetId: null, frame: "tfg:hero"});
    const {context, calls} = recordingContext();
    renderScene(context, buildRenderList(source), camera, {pixelArt: true});
    expect(calls.filter(call => call.name === "fillRect").length).toBeGreaterThan(30);
    expect(calls.filter(call => call.name === "stroke")).toEqual([]);
  });

  it("draws a supplied image with component flips, and unresolved named frames remain placeholders", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    source.objects[0].components[1].properties.flipX = true;
    source.objects[1].components[1].properties.frame = "idle";
    const bitmap = document.createElement("canvas");
    const { context, calls } = recordingContext();
    renderScene(context, buildRenderList(source), camera, {
      images: new Map([[id(90), bitmap]]),
    });
    expect(calls.filter((call) => call.name === "drawImage")).toEqual([
      { name: "drawImage", args: [bitmap, 0, 0, 20, 10] },
    ]);
    expect(calls).toContainEqual({ name: "scale", args: [-1, 1] });
    expect(calls).toContainEqual({ name: "translate", args: [20, 0] });
    expect(calls.filter((call) => call.name === "fillRect")).toHaveLength(1);
  });

  it("draws ordered shape/text/tile/effect primitives from canonical components", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    source.layers[0].type = "UI";
    source.objects = [
      {
        ...source.objects[0],
        components: [
          component(20, "Transform"),
          component(30, "UIPanel", {
            backgroundColor: "#ff0000",
            borderColor: "#00ff00",
          }),
          component(31, "Text", {
            text: "Hello",
            color: "#ffffff",
            align: "RIGHT",
            fontSize: 12,
          }),
          component(32, "Custom", { definitionKey: "effect.rain" }),
        ],
      },
    ];
    const { context, calls } = recordingContext();
    renderScene(context, buildRenderList(source), camera);
    expect(calls).toContainEqual({ name: "fillStyle", args: ["#ff0000"] });
    expect(calls).toContainEqual({ name: "strokeStyle", args: ["#00ff00"] });
    expect(calls).toContainEqual({
      name: "fillText",
      args: ["Hello", 32, 0, 32],
    });
    expect(calls).toContainEqual({
      name: "fillText",
      args: ["effect.rain", 2, 2, 28],
    });
    source.layers[0].type = "WORLD";
    source.objects[0].components = [
      component(20, "Transform"),
      component(30, "Tilemap", {
        columns: 3,
        rows: 2,
        tiles: [{ x: 2, y: 1, tile: 7 }],
        tileWidth: 8,
        tileHeight: 10,
      }),
    ];
    calls.length = 0;
    renderScene(context, buildRenderList(source), camera);
    expect(calls.filter((call) => call.name === "fillRect")).toEqual([
      { name: "fillRect", args: [16, 10, 8, 10] },
    ]);
  });

  it("draws locked objects identically and culls offscreen items without mutating the render list", async () => {
    const { renderScene } = await renderer();
    const source = scene();
    source.objects[1].components[0].properties.x = 10000;
    const list = buildRenderList(source);
    const before = structuredClone(list);
    const first = recordingContext();
    renderScene(first.context, list, camera);
    expect(first.calls.filter((call) => call.name === "fillRect")).toHaveLength(
      1,
    );
    source.layers[0].locked = true;
    const second = recordingContext();
    renderScene(second.context, buildRenderList(source), camera);
    expect(second.calls).toEqual(first.calls);
    expect(list).toEqual(before);
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid device pixel ratio %s",
    async (pixelRatio) => {
      const { renderScene } = await renderer();
      const { context, calls } = recordingContext();
      expect(() => renderScene(context, [], camera, { pixelRatio })).toThrow(
        RangeError,
      );
      expect(calls).toEqual([]);
    },
  );
});

describe("editor hit testing and selection geometry", () => {
  it("returns the topmost stable object ID and skips locked/hidden/disabled candidates", async () => {
    const { hitTest } = await hits();
    const source = scene();
    expect(hitTest(buildRenderList(source), { x: 110, y: 55 })).toBe(id(11));
    source.objects[1].locked = true;
    expect(hitTest(buildRenderList(source), { x: 110, y: 55 })).toBe(id(10));
    source.objects[0].enabled = false;
    expect(hitTest(buildRenderList(source), { x: 110, y: 55 })).toBeNull();
    source.objects[1].locked = false;
    source.layers[0].visible = false;
    expect(hitTest(buildRenderList(source), { x: 110, y: 55 })).toBeNull();
  });

  it("inverts actual rotated/mirrored hierarchy transforms instead of hitting world AABBs", async () => {
    const { hitTest } = await hits();
    const source = scene();
    source.objects[1].components = [
      component(21, "Transform", {
        x: 0,
        y: 0,
        rotation: 45,
        width: 100,
        height: 10,
        scaleX: -2,
        pivot: { x: 0, y: 0 },
      }),
      component(31, "SpriteRenderer"),
    ];
    source.objects[1].parentId = id(10);
    expect(hitTest(buildRenderList(source), { x: 65, y: 19 })).toBe(id(11));
    expect(hitTest(buildRenderList(source), { x: -40, y: 50 })).toBeNull();
    expect(hitTest(buildRenderList(source), { x: NaN, y: 0 })).toBeNull();
  });

  it("resolves selection bounds by stable IDs including locked objects without retaining input bounds", async () => {
    const { selectionBounds } = await hits();
    const source = scene();
    source.objects[0].locked = true;
    source.objects[1].components[0].properties.x = -10;
    source.objects[1].components[0].properties.rotation = 90;
    const list = buildRenderList(source);
    const bounds = selectionBounds(list, [id(11), id(10), id(10), id(99)])!;
    expect(bounds.x).toBeCloseTo(-5);
    expect(bounds.y).toBeCloseTo(45);
    expect(bounds.width).toBeCloseTo(125);
    expect(bounds.height).toBeCloseTo(20);
    expect(selectionBounds(list, [])).toBeNull();
    expect(selectionBounds(list, [id(99)])).toBeNull();
    expect(selectionBounds(list, [id(10)])).not.toBe(list[0].bounds);
  });

  it("avoids empty groups, transparent graphics, empty tile cells, and ellipse corners", async () => {
    const { hitTest } = await hits();
    const source = scene();
    source.layers[0].type = "COLLISION";
    source.objects = [
      {
        ...source.objects[0],
        components: [
          component(20, "Transform", { x: 0, y: 0 }),
          {
            id: id(30),
            type: "Collider",
            version: 1,
            properties: {
              shape: "CIRCLE",
              radius: 10,
              offsetX: 0,
              offsetY: 0,
              isTrigger: false,
              collisionLayerId: null,
            },
          },
        ],
      },
    ];
    expect(hitTest(buildRenderList(source), { x: 1, y: 1 })).toBeNull();
    expect(hitTest(buildRenderList(source), { x: 10, y: 10 })).toBe(id(10));
    source.objects[0].components = [
      component(20, "Transform", { x: 0, y: 0 }),
      component(30, "Tilemap", {
        columns: 2,
        tiles: [{ x: 1, y: 0, tile: 2 }],
      }),
    ];
    expect(hitTest(buildRenderList(source), { x: 10, y: 10 })).toBeNull();
    expect(hitTest(buildRenderList(source), { x: 40, y: 10 })).toBe(id(10));
    source.objects[0].components = [component(20, "Transform")];
    expect(hitTest(buildRenderList(source), { x: 10, y: 10 })).toBeNull();
  });
});
