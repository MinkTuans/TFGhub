import { expect, it } from "vitest";
import { createGameRuntime } from "./game-runtime.js";
import { v2ComponentRegistry } from "../v2/component-registry.js";
import type { EngineProjectV2 } from "../v2/project-schema.js";
let serial = 1;
const id = () =>
  `550e8400-e29b-41d4-a716-${String(serial++).padStart(12, "0")}`;
function fixture() {
  const layerId = id();
  const obj = (type: any, x: number, extras: any[]) => ({
    id: id(),
    name: type,
    objectType: type,
    parentId: null,
    layerId,
    enabled: true,
    visible: true,
    locked: false,
    order: serial,
    renderOrder: 0,
    components: [
      component("Transform", { x, y: 20, width: 16, height: 16 }),
      ...extras,
    ],
  });
  const component = (type: any, properties: any = {}) => ({
    id: id(),
    version: 1,
    type,
    properties: {
      ...(v2ComponentRegistry as any)[type].defaults(),
      ...properties,
    },
  });
  const player = obj("PLAYER", 20, [
    component("Movement", { controls: "PLAYER", speed: 100 }),
    component("Collider", { width: 16, height: 16 }),
    component("Health", { current: 2, maximum: 2 }),
  ]);
  const item = obj("ITEM", 45, [
    component("Collider", { width: 16, height: 16, isTrigger: true }),
    component("InventoryItem"),
  ]);
  const wall = obj("DECORATION", 80, [
    component("Collider", { width: 16, height: 16 }),
  ]);
  const scene = {
    id: id(),
    name: "Test",
    key: "test",
    order: 0,
    type: "MAP",
    width: 320,
    height: 240,
    background: { color: "#000000", assetId: null },
    settings: {
      gravityX: 0,
      gravityY: 0,
      grid: { enabled: false, size: 16, snap: false },
    },
    layers: [
      {
        id: layerId,
        name: "World",
        order: 0,
        type: "WORLD",
        visible: true,
        locked: false,
      },
    ],
    objects: [player, item, wall],
  };
  const project = {
    schemaVersion: 2,
    projectId: id(),
    engineFamily: "TFG_ENGINE",
    entrySceneId: scene.id,
    settings: { viewport: { width: 320, height: 240 }, pixelArt: true },
    assetIds: [],
    scenes: [scene],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  } as unknown as EngineProjectV2;
  const event = (trigger: any, steps: any[], condition: any = null) => ({
    id: id(),
    version: 1 as const,
    name: "Event",
    enabled: true,
    order: project.events.length,
    trigger,
    condition,
    steps: steps.map((step) => ({ id: id(), version: 1, ...step })),
  });
  project.events.push(
    event(
      {
        type: "ON_COLLECT_ITEM",
        itemObjectId: item.id,
        collectorObjectId: player.id,
      },
      [{ type: "ADD_SCORE", amount: 10 }],
    ),
  );
  return { project, player, item, wall, event };
}
it("moves, collects once, stops at solids and restores everything on restart", () => {
  const f = fixture(),
    r = createGameRuntime(f.project);
  for (let i = 0; i < 20; i++) r.tick(1 / 60, { right: true });
  expect(r.state.score).toBe(10);
  expect(r.scene().objects.find((o) => o.id === f.item.id)?.enabled).toBe(
    false,
  );
  for (let i = 0; i < 60; i++) r.tick(1 / 60, { right: true });
  expect(
    r.properties(r.scene().objects[0], "Transform")!.x,
  ).toBeLessThanOrEqual(64);
  r.restart();
  expect(r.state.score).toBe(0);
  expect(r.scene().objects[1].enabled).toBe(true);
  expect((f.player.components[0].properties as any).x).toBe(20);
});
it("conditional exit and hazard loss use authored actions", () => {
  const f = fixture();
  const health = f.player.components.find((c) => c.type === "Health")!;
  f.project.events.push(
    f.event(
      {
        type: "ON_COLLISION",
        firstObjectId: f.player.id,
        secondObjectId: f.wall.id,
      },
      [
        {
          type: "CHANGE_HEALTH",
          objectId: f.player.id,
          componentId: health.id,
          amount: -2,
        },
      ],
    ),
  );
  const r = createGameRuntime(f.project);
  for (let i = 0; i < 90; i++) r.tick(1 / 60, { right: true });
  expect(r.state.status).toBe("lost");
  const g = fixture();
  g.project.events.push(
    g.event(
      {
        type: "ON_COLLECT_ITEM",
        itemObjectId: g.item.id,
        collectorObjectId: g.player.id,
      },
      [{ type: "COMPLETE_GAME" }],
      {
        id: id(),
        version: 1,
        type: "SCORE_COMPARE",
        operator: "GREATER_THAN_OR_EQUAL",
        value: 10,
      },
    ),
  );
  const win = createGameRuntime(g.project);
  for (let i = 0; i < 30; i++) win.tick(1 / 60, { right: true });
  expect(win.state.status).toBe("won");
});
it("rejects undeclared script commands and wrong variable types with bounded diagnostics", () => {
  const f = fixture();
  const variable = {
    id: id(),
    name: "greeting",
    type: "STRING" as const,
    initialValue: "hello",
  };
  f.project.variables.global.push(variable);
  const script = {
    id: id(),
    version: 1 as const,
    name: "script",
    language: "JAVASCRIPT" as const,
    source: "",
    capabilities: [] as any[],
    attachments: [],
  };
  f.project.scripts.push(script);
  const r = createGameRuntime(f.project);
  expect(
    r.command(script.id, {
      type: "SET_VARIABLE",
      variableId: variable.id,
      value: "bye",
    }),
  ).toBe(false);
  script.capabilities.push("SET_VARIABLE");
  const allowed = createGameRuntime(f.project);
  expect(
    allowed.command(script.id, {
      type: "SET_VARIABLE",
      variableId: variable.id,
      value: 3,
    }),
  ).toBe(false);
  expect(
    allowed.command(script.id, {
      type: "SET_VARIABLE",
      variableId: variable.id,
      value: "bye",
    }),
  ).toBe(true);
  expect(allowed.state.variables[variable.id]).toBe("bye");
});
it("bounds cyclic scene-start events without overflowing the call stack", () => {
  const f = fixture();
  f.project.events.push(
    f.event({ type: "ON_START" }, [
      { type: "CHANGE_SCENE", sceneId: f.project.entrySceneId },
    ]),
  );
  const r = createGameRuntime(f.project);
  expect(r.state.diagnostics.join(" ")).toContain("budget");
});
it("waits inside sequences preserve ordering of the outer continuation", () => {
  const f = fixture();
  f.project.events.push(
    f.event({ type: "ON_START" }, [
      {
        type: "SEQUENCE",
        steps: [
          { id: id(), version: 1, type: "WAIT", durationMs: 100 },
          { id: id(), version: 1, type: "ADD_SCORE", amount: 3 },
        ],
      },
      { type: "COMPLETE_GAME" },
    ]),
  );
  const r = createGameRuntime(f.project);
  expect(r.state.status).toBe("playing");
  for (let i = 0; i < 7; i++) r.tick(1 / 60);
  expect(r.state.score).toBe(3);
  expect(r.state.status).toBe("won");
});
it("diagnoses unsupported physical transforms and dialogue triggers explicitly", () => {
  const f = fixture();
  (f.player.components[0].properties as any).rotation = 30;
  f.project.events.push(
    f.event(
      {
        type: "ON_DIALOGUE_END",
        objectId: f.player.id,
        componentId: f.player.components[0].id,
      },
      [{ type: "ADD_SCORE", amount: 1 }],
    ),
  );
  const r = createGameRuntime(f.project);
  expect(r.state.diagnostics.join(" ")).toContain("transformed");
  expect(r.state.diagnostics.join(" ")).toContain("ON_DIALOGUE_END");
});
