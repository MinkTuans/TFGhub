import { describe, expect, it } from "vitest";
import {
  ENGINE_V2_LIMITS,
  EngineProjectV1,
  EngineProjectV2,
  V2_COMPONENT_TYPES,
  V2_EVENT_STEP_TYPES,
  V2_MINI_GAME_TYPES,
  readEngineProject,
} from "../index.js";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;
const ids = {
  project: id("0001"),
  asset: id("0002"),
  scene: id("0003"),
  layer: id("0004"),
  object: id("0005"),
  transform: id("0006"),
  variable: id("0007"),
  event: id("0008"),
  step: id("0009"),
  module: id("000a"),
  script: id("000b"),
  attachment: id("000c"),
  prefab: id("000d"),
  prefabTransform: id("000e"),
  secondScene: id("000f"),
};

const transform = (componentId = ids.transform) => ({
  id: componentId,
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
});

function project() {
  return {
    schemaVersion: 2,
    projectId: ids.project,
    engineFamily: "TFG_ENGINE",
    entrySceneId: ids.scene,
    settings: {
      viewport: { width: 1280, height: 720 },
      pixelArt: false,
    },
    assetIds: [ids.asset],
    scenes: [
      {
        id: ids.scene,
        name: "Village",
        key: "village",
        order: 0,
        type: "MIXED",
        width: 1280,
        height: 720,
        background: { color: "#102040", assetId: ids.asset },
        settings: {
          gravityX: 0,
          gravityY: 0,
          grid: { enabled: true, size: 32, snap: true },
        },
        layers: [
          {
            id: ids.layer,
            name: "World",
            order: 0,
            type: "WORLD",
            visible: true,
            locked: false,
          },
        ],
        objects: [
          {
            id: ids.object,
            name: "Guide",
            objectType: "NPC",
            parentId: null,
            layerId: ids.layer,
            enabled: true,
            visible: true,
            locked: false,
            order: 0,
            renderOrder: 0,
            components: [transform()],
          },
        ],
      },
    ],
    variables: {
      global: [
        {
          id: ids.variable,
          name: "Score",
          type: "NUMBER",
          initialValue: 0,
        },
      ],
      player: [],
      scene: { [ids.scene]: [] },
    },
    prefabs: [
      {
        id: ids.prefab,
        name: "Guide prefab",
        objectType: "NPC",
        components: [transform(ids.prefabTransform)],
      },
    ],
    events: [
      {
        id: ids.event,
        version: 1,
        name: "Start",
        enabled: true,
        order: 0,
        trigger: { type: "ON_START" },
        condition: null,
        steps: [{ id: ids.step, version: 1, type: "ADD_SCORE", amount: 1 }],
      },
    ],
    modules: [
      {
        id: ids.module,
        version: 1,
        name: "Reaction",
        type: "REACTION",
        config: {
          rounds: 1,
          minimumDelayMs: 0,
          maximumDelayMs: 0,
          responseTimeoutMs: 1_000,
        },
      },
    ],
    scripts: [
      {
        id: ids.script,
        version: 1,
        name: "Scene script",
        language: "JAVASCRIPT",
        source: "",
        capabilities: [],
        attachments: [
          {
            id: ids.attachment,
            type: "SCENE",
            sceneId: ids.scene,
          },
        ],
      },
    ],
  };
}

describe("EngineProjectV2 aggregate schema", () => {
  it("exports and normalizes the complete closed V2 document", () => {
    expect(V2_COMPONENT_TYPES).toContain("Transform");
    expect(V2_EVENT_STEP_TYPES).toContain("START_MINI_GAME");
    expect(V2_MINI_GAME_TYPES).toEqual([
      "QUIZ",
      "PUZZLE",
      "MEMORY",
      "DRAG_DROP",
      "REACTION",
    ]);
    const candidate = project();
    candidate.projectId = ids.project.toUpperCase();
    candidate.scenes[0]!.id = ids.scene.toUpperCase();
    candidate.entrySceneId = ids.scene.toUpperCase();
    const parsed = EngineProjectV2.parse(candidate);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.projectId).toBe(ids.project);
    expect(parsed.scenes[0]!.id).toBe(ids.scene);
    expect(Object.keys(parsed)).toEqual([
      "schemaVersion",
      "projectId",
      "engineFamily",
      "entrySceneId",
      "settings",
      "assetIds",
      "scenes",
      "variables",
      "prefabs",
      "events",
      "modules",
      "scripts",
    ]);
  });

  it("round-trips deterministically without editor or vendor state", () => {
    const canonical = EngineProjectV2.parse(project());
    const bytes = JSON.stringify(canonical);
    expect(JSON.stringify(EngineProjectV2.parse(JSON.parse(bytes)))).toBe(
      bytes,
    );
    expect(
      EngineProjectV2.safeParse({ ...project(), editorState: { zoom: 2 } })
        .success,
    ).toBe(false);
    expect(
      EngineProjectV2.safeParse({ ...project(), reactFlow: { nodes: [] } })
        .success,
    ).toBe(false);
    expect(
      EngineProjectV2.safeParse({ ...project(), runtime: () => undefined })
        .success,
    ).toBe(false);
  });

  it("rejects unknown fields at nested aggregate boundaries", () => {
    const settings = project();
    Object.assign(settings.settings, { selectedTool: "pan" });
    expect(EngineProjectV2.safeParse(settings).success).toBe(false);
    const variable = project();
    Object.assign(variable.variables.global[0]!, { uiColor: "red" });
    expect(EngineProjectV2.safeParse(variable).success).toBe(false);
    const prefab = project();
    Object.assign(prefab.prefabs[0]!, { databaseId: 12 });
    expect(EngineProjectV2.safeParse(prefab).success).toBe(false);
  });

  it.each([
    [
      "asset",
      (value: ReturnType<typeof project>) => {
        value.assetIds[0] = value.projectId;
      },
    ],
    [
      "scene",
      (value: ReturnType<typeof project>) => {
        value.scenes[0]!.id = value.assetIds[0]!;
        value.entrySceneId = value.assetIds[0]!;
      },
    ],
    [
      "layer",
      (value: ReturnType<typeof project>) => {
        value.scenes[0]!.layers[0]!.id = value.projectId;
        value.scenes[0]!.objects[0]!.layerId = value.projectId;
      },
    ],
    [
      "object",
      (value: ReturnType<typeof project>) => {
        value.scenes[0]!.objects[0]!.id = value.events[0]!.id;
      },
    ],
    [
      "component",
      (value: ReturnType<typeof project>) => {
        value.scenes[0]!.objects[0]!.components[0]!.id =
          value.variables.global[0]!.id;
      },
    ],
    [
      "event step",
      (value: ReturnType<typeof project>) => {
        value.events[0]!.steps[0]!.id = value.scripts[0]!.id;
      },
    ],
    [
      "module",
      (value: ReturnType<typeof project>) => {
        value.modules[0]!.id = value.prefabs[0]!.id;
      },
    ],
    [
      "attachment",
      (value: ReturnType<typeof project>) => {
        value.scripts[0]!.attachments[0]!.id = value.assetIds[0]!;
      },
    ],
  ])("rejects a global Stable ID collision involving %s", (_kind, mutate) => {
    const candidate = project();
    mutate(candidate);
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("rejects global collisions inside prefab Dialogue nodes", () => {
    const candidate = project();
    candidate.prefabs[0]!.components.push({
      id: id("0920"),
      type: "Dialogue",
      version: 1,
      properties: {
        startNodeId: candidate.projectId,
        nodes: [
          {
            id: candidate.projectId,
            speakerName: "Guide",
            avatarAssetId: null,
            text: "Hello",
            choices: [],
          },
        ],
      },
    });
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("requires unique scene keys and ordering", () => {
    const candidate = project();
    candidate.scenes.push({
      ...candidate.scenes[0]!,
      id: ids.secondScene,
      layers: [
        {
          ...candidate.scenes[0]!.layers[0]!,
          id: id("0930"),
        },
      ],
      objects: [],
    });
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("requires unique event ordering", () => {
    const events = project();
    events.events.push({
      ...events.events[0]!,
      id: id("0931"),
      steps: [{ ...events.events[0]!.steps[0]!, id: id("0932") }],
    });
    expect(EngineProjectV2.safeParse(events).success).toBe(false);
  });

  it("rejects Collider and Camera references into another scene", () => {
    const candidate = project();
    const otherLayer = id("0940");
    const otherObject = id("0941");
    candidate.scenes.push({
      ...candidate.scenes[0]!,
      id: ids.secondScene,
      key: "forest",
      order: 1,
      layers: [
        {
          id: otherLayer,
          name: "Collision",
          order: 0,
          type: "COLLISION",
          visible: true,
          locked: false,
        },
      ],
      objects: [
        {
          ...candidate.scenes[0]!.objects[0]!,
          id: otherObject,
          layerId: otherLayer,
          components: [transform(id("0942"))],
        },
      ],
    });
    candidate.scenes[0]!.objects[0]!.components.push(
      {
        id: id("0943"),
        type: "Collider",
        version: 1,
        properties: {
          shape: "RECTANGLE",
          width: 32,
          height: 32,
          offsetX: 0,
          offsetY: 0,
          isTrigger: false,
          collisionLayerId: otherLayer,
        },
      },
      {
        id: id("0944"),
        type: "Camera",
        version: 1,
        properties: {
          followObjectId: otherObject,
          bounds: null,
          smoothing: 0,
        },
      },
    );
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("requires exactly one Transform per prefab", () => {
    const without = project();
    without.prefabs[0]!.components = [];
    expect(EngineProjectV2.safeParse(without).success).toBe(false);

    const duplicate = project();
    duplicate.prefabs[0]!.components.push(transform(id("0950")));
    expect(EngineProjectV2.safeParse(duplicate).success).toBe(false);
    expect(EngineProjectV2.safeParse(project()).success).toBe(true);
  });

  it("defers layer compatibility for prefab components until placement", () => {
    const candidate = project();
    candidate.prefabs[0]!.components.push({
      id: id("0951"),
      type: "UIButton",
      version: 1,
      properties: {
        anchorX: 0.5,
        anchorY: 0.5,
        visible: true,
        visibilityVariable: null,
        label: "Start",
        eventId: null,
        enabled: true,
      },
    });
    expect(EngineProjectV2.safeParse(candidate).success).toBe(true);
  });

  it.each([
    [
      "entry scene",
      (value: ReturnType<typeof project>) => {
        value.entrySceneId = ids.secondScene;
      },
    ],
    [
      "scene variable scope",
      (value: ReturnType<typeof project>) => {
        value.variables.scene = { [ids.secondScene]: [] };
      },
    ],
    [
      "background asset",
      (value: ReturnType<typeof project>) => {
        value.scenes[0]!.background.assetId = id("0900");
      },
    ],
    [
      "script attachment",
      (value: ReturnType<typeof project>) => {
        value.scripts[0]!.attachments[0]!.sceneId = id("0901");
      },
    ],
  ])("rejects a dangling %s reference", (_kind, mutate) => {
    const candidate = project();
    mutate(candidate);
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("rejects dangling component, event, module, and script references", () => {
    const candidate = project();
    candidate.scenes[0]!.objects[0]!.components.push(
      {
        id: id("0910"),
        type: "Script",
        version: 1,
        properties: { scriptIds: [id("0911")] },
      },
      {
        id: id("0912"),
        type: "MiniGame",
        version: 1,
        properties: {
          moduleId: id("0913"),
          returnSceneId: null,
          resultEventId: null,
        },
      },
    );
    expect(EngineProjectV2.safeParse(candidate).success).toBe(false);
  });

  it("rejects non-finite geometry and aggregate resource overflows", () => {
    const geometry = project();
    geometry.scenes[0]!.objects[0]!.components[0]!.properties.x = Number.NaN;
    expect(EngineProjectV2.safeParse(geometry).success).toBe(false);
    const assets = project();
    assets.assetIds = Array.from(
      { length: ENGINE_V2_LIMITS.assets + 1 },
      (_, index) => id((0x1000 + index).toString(16).padStart(4, "0")),
    );
    expect(EngineProjectV2.safeParse(assets).success).toBe(false);
  });

  it("preserves V1 reader behavior, supports V2, and keeps future schemas raw", () => {
    const v2 = readEngineProject(project());
    expect(v2.status).toBe("SUPPORTED");
    if (v2.status === "SUPPORTED") expect(v2.project.schemaVersion).toBe(2);

    const v1 = {
      schemaVersion: 1,
      projectId: id("0a00"),
      engineFamily: "TFG_ENGINE",
      entrySceneId: id("0a01"),
      settings: { viewport: { width: 1280, height: 720 } },
      assetIds: [],
      scenes: [
        {
          id: id("0a01"),
          name: "Legacy",
          order: 0,
          objects: [],
        },
      ],
      variables: { global: [], player: [], scene: {} },
      events: [],
      prefabs: [],
    };
    const v1Result = readEngineProject(v1);
    expect(v1Result.status).toBe("SUPPORTED");
    if (v1Result.status === "SUPPORTED") {
      expect(v1Result.project.schemaVersion).toBe(1);
    }

    const v1Invalid = EngineProjectV1.safeParse({ schemaVersion: 1 });
    expect(v1Invalid.success).toBe(false);
    expect(readEngineProject({ schemaVersion: 1 }).status).toBe("INVALID");

    const future = { schemaVersion: 3, document: { untouched: true } };
    expect(readEngineProject(future)).toEqual({
      status: "UNSUPPORTED_FUTURE_SCHEMA",
      raw: future,
      schemaVersion: 3,
    });
  });
});
