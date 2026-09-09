import { describe, expect, it } from "vitest";
import { SceneV2, V2_SCENE_LIMITS } from "./scene-schema.js";

const id = {
  scene: "11111111-1111-4111-8111-111111111111",
  world: "22222222-2222-4222-8222-222222222222",
  ui: "33333333-3333-4333-8333-333333333333",
  collision: "44444444-4444-4444-8444-444444444444",
  parent: "55555555-5555-4555-8555-555555555555",
  child: "66666666-6666-4666-8666-666666666666",
  transform1: "77777777-7777-4777-8777-777777777777",
  transform2: "88888888-8888-4888-8888-888888888888",
  sprite: "99999999-9999-4999-8999-999999999999",
  button: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

const transform = (componentId: string) => ({
  id: componentId,
  type: "Transform" as const,
  version: 1 as const,
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

function validScene() {
  return {
    id: id.scene,
    name: "Village",
    key: "village",
    order: 0,
    type: "MIXED" as const,
    width: 1280,
    height: 720,
    background: { color: "#102040", assetId: null },
    settings: {
      gravityX: 0,
      gravityY: 0,
      grid: { enabled: true, size: 32, snap: true },
    },
    layers: [
      {
        id: id.world,
        name: "World",
        order: 0,
        type: "WORLD" as const,
        visible: true,
        locked: false,
      },
      {
        id: id.ui,
        name: "UI",
        order: 1,
        type: "UI" as const,
        visible: true,
        locked: false,
      },
      {
        id: id.collision,
        name: "Collision",
        order: 2,
        type: "COLLISION" as const,
        visible: true,
        locked: false,
      },
    ],
    objects: [
      {
        id: id.parent,
        name: "Player",
        objectType: "PLAYER" as const,
        parentId: null,
        layerId: id.world,
        enabled: true,
        visible: true,
        locked: false,
        order: 0,
        renderOrder: 10,
        components: [
          transform(id.transform1),
          {
            id: id.sprite,
            type: "SpriteRenderer" as const,
            version: 1 as const,
            properties: {
              assetId: null,
              frame: null,
              visible: true,
              opacity: 1,
              flipX: false,
              flipY: false,
            },
          },
        ],
      },
      {
        id: id.child,
        name: "Start button",
        objectType: "UI" as const,
        parentId: null,
        layerId: id.ui,
        enabled: true,
        visible: true,
        locked: false,
        order: 0,
        renderOrder: 0,
        components: [
          transform(id.transform2),
          {
            id: id.button,
            type: "UIButton" as const,
            version: 1 as const,
            properties: {
              anchorX: 0.5,
              anchorY: 0.5,
              visible: true,
              visibilityVariable: null,
              label: "Start",
              eventId: null,
              enabled: true,
            },
          },
        ],
      },
    ],
  };
}

describe("SceneV2", () => {
  it("normalizes a mixed scene composed from layers, objects, and components", () => {
    expect(SceneV2.parse(validScene())).toEqual(validScene());
  });

  it.each([
    [
      "scene",
      (scene: ReturnType<typeof validScene>) =>
        Object.assign(scene, { editorState: { zoom: 2 } }),
    ],
    [
      "layer",
      (scene: ReturnType<typeof validScene>) =>
        Object.assign(scene.layers[0], { vendorGraph: {} }),
    ],
    [
      "object",
      (scene: ReturnType<typeof validScene>) =>
        Object.assign(scene.objects[0], { selected: true }),
    ],
    [
      "component",
      (scene: ReturnType<typeof validScene>) =>
        Object.assign(scene.objects[0].components[0], { runtime: () => true }),
    ],
  ])("rejects non-canonical %s state", (_name, mutate) => {
    const scene = validScene();
    mutate(scene);
    expect(SceneV2.safeParse(scene).success).toBe(false);
  });

  it("rejects non-finite or non-positive scene and transform geometry", () => {
    const infiniteScene = validScene();
    infiniteScene.width = Number.POSITIVE_INFINITY;
    expect(SceneV2.safeParse(infiniteScene).success).toBe(false);

    const nanTransform = validScene();
    nanTransform.objects[0].components[0].properties.x = Number.NaN;
    expect(SceneV2.safeParse(nanTransform).success).toBe(false);
  });

  it("rejects missing layers and duplicate layer or object ordering", () => {
    const missingLayer = validScene();
    missingLayer.objects[0].layerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(SceneV2.safeParse(missingLayer).success).toBe(false);

    const duplicateLayerOrder = validScene();
    duplicateLayerOrder.layers[1].order = 0;
    expect(SceneV2.safeParse(duplicateLayerOrder).success).toBe(false);

    const duplicateObjectOrder = validScene();
    duplicateObjectOrder.objects[1].layerId = id.world;
    duplicateObjectOrder.objects[1].order = 0;
    expect(SceneV2.safeParse(duplicateObjectOrder).success).toBe(false);
  });

  it("rejects dangling, cross-scene, self, and cyclic parent relationships", () => {
    const dangling = validScene();
    dangling.objects[1].parentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(SceneV2.safeParse(dangling).success).toBe(false);

    const self = validScene();
    self.objects[0].parentId = id.parent;
    expect(SceneV2.safeParse(self).success).toBe(false);

    const cycle = validScene();
    cycle.objects[0].parentId = id.child;
    cycle.objects[1].parentId = id.parent;
    expect(SceneV2.safeParse(cycle).success).toBe(false);
  });

  it("rejects duplicate stable IDs inside a scene", () => {
    const duplicateObject = validScene();
    duplicateObject.objects[1].id = id.parent;
    expect(SceneV2.safeParse(duplicateObject).success).toBe(false);

    const duplicateComponent = validScene();
    duplicateComponent.objects[1].components[0].id = id.transform1;
    expect(SceneV2.safeParse(duplicateComponent).success).toBe(false);
  });

  it("rejects dialogue node and choice IDs colliding anywhere in the scene", () => {
    const scene = validScene();
    scene.objects[0].components.push({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "Dialogue",
      version: 1,
      properties: {
        startNodeId: id.parent,
        nodes: [
          {
            id: id.parent,
            speakerName: "NPC",
            avatarAssetId: null,
            text: "Hello",
            choices: [
              {
                id: id.transform2,
                text: "Continue",
                conditionId: null,
                eventId: null,
              },
            ],
          },
        ],
      },
    });
    expect(SceneV2.safeParse(scene).success).toBe(false);
  });

  it("rejects components placed on incompatible layer types", () => {
    const uiOnWorld = validScene();
    uiOnWorld.objects[1].layerId = id.world;
    uiOnWorld.objects[1].order = 1;
    expect(SceneV2.safeParse(uiOnWorld).success).toBe(false);
  });

  it("enforces scene resource limits", () => {
    const tooManyLayers = validScene();
    tooManyLayers.layers = Array.from(
      { length: V2_SCENE_LIMITS.layers + 1 },
      (_, index) => ({
        id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
        name: `Layer ${index}`,
        order: index,
        type: "WORLD" as const,
        visible: true,
        locked: false,
      }),
    );
    expect(SceneV2.safeParse(tooManyLayers).success).toBe(false);
  });
});
