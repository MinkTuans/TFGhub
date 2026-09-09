import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EngineProjectV1,
  EngineProjectV2,
  adaptPlatformerV0,
  adaptStoryV0,
  upgradeEngineProjectV1,
} from "../index.js";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );

function stableIds(value: unknown): string[] {
  const ids: string[] = [];
  const visit = (child: unknown) => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (!child || typeof child !== "object") return;
    for (const [key, nested] of Object.entries(child)) {
      if (key === "id" && typeof nested === "string") ids.push(nested);
      visit(nested);
    }
  };
  visit(value);
  return ids;
}

describe("upgradeEngineProjectV1", () => {
  it("adds explicit center pivots to upgraded object and prefab transforms without changing V1 local data", () => {
    const source = EngineProjectV1.parse(
      JSON.parse(fixture("v1-project.json")),
    );
    const before = structuredClone(source);
    const output = upgradeEngineProjectV1(source);
    const components = [
      ...output.scenes.flatMap((scene) =>
        scene.objects.flatMap((object) => object.components),
      ),
      ...output.prefabs.flatMap((prefab) => prefab.components),
    ];
    const transforms = components.filter(
      (component) => component.type === "Transform",
    );
    expect(transforms.length).toBeGreaterThan(0);
    for (const transform of transforms)
      expect(transform.properties).toHaveProperty("pivot", { x: 0.5, y: 0.5 });
    expect(source).toEqual(before);
  });

  it("matches the reviewed V2 golden bytes without mutating or replacing V1 IDs", () => {
    const source = EngineProjectV1.parse(
      JSON.parse(fixture("v1-project.json")),
    );
    const snapshot = structuredClone(source);

    const first = upgradeEngineProjectV1(source);
    const second = upgradeEngineProjectV1(source);
    const bytes = `${JSON.stringify(first, null, 2)}\n`;

    expect(bytes).toBe(fixture("v2-upgraded.golden.json"));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(source).toEqual(snapshot);
    expect(EngineProjectV2.parse(first)).toEqual(first);
    expect(first.projectId).toBe(source.projectId);
    expect(first.assetIds).toEqual(source.assetIds);
    for (const existingId of stableIds(source)) {
      expect(stableIds(first)).toContain(existingId);
    }
  });

  it("uses stable IDs rather than mutable display names for generated identities", () => {
    const source = EngineProjectV1.parse(
      JSON.parse(fixture("v1-project.json")),
    );
    const renamed = structuredClone(source);
    renamed.scenes[0]!.name = "Renamed scene";
    renamed.scenes[0]!.objects[0]!.name = "Renamed object";

    const original = upgradeEngineProjectV1(source);
    const upgradedRename = upgradeEngineProjectV1(renamed);

    expect(upgradedRename.scenes[0]!.layers[0]!.id).toBe(
      original.scenes[0]!.layers[0]!.id,
    );
    expect(upgradedRename.scenes[0]!.objects[0]!.components[0]!.id).toBe(
      original.scenes[0]!.objects[0]!.components[0]!.id,
    );
  });

  it.each([
    ["STORY", adaptStoryV0, "story-v0.json"],
    ["PLATFORMER", adaptPlatformerV0, "platformer-v0.json"],
  ] as const)(
    "upgrades a materialized legacy %s project",
    (_type, adapt, name) => {
      const raw = JSON.parse(
        readFileSync(
          fileURLToPath(
            new URL(`../adapters/fixtures/${name}`, import.meta.url),
          ),
          "utf8",
        ),
      );
      const adapted = adapt("legacy-game-id", raw);
      expect(adapted.status).toBe("CONVERTED");
      if (adapted.status !== "CONVERTED") return;

      const upgraded = upgradeEngineProjectV1(adapted.project);
      expect(EngineProjectV2.safeParse(upgraded).success).toBe(true);
      expect(upgraded.projectId).toBe(adapted.project.projectId);
      expect(upgraded.assetIds).toEqual(adapted.project.assetIds);
      for (const existingId of stableIds(adapted.project)) {
        expect(stableIds(upgraded)).toContain(existingId);
      }
      if (_type === "PLATFORMER") {
        const customComponents = upgraded.scenes[0]!.objects.flatMap((object) =>
          object.components.filter((component) => component.type === "Custom"),
        );
        expect(
          customComponents.map(
            (component) => component.properties.definitionKey,
          ),
        ).toEqual(
          expect.arrayContaining([
            "tfg.v1.physics",
            "tfg.v1.movement",
            "tfg.v1.collectible",
            "tfg.v1.shape",
          ]),
        );
        expect(
          upgraded.events.some(
            (event) =>
              event.trigger.type === "ON_COLLISION" &&
              event.steps.some((step) => step.type === "COMPLETE_GAME"),
          ),
        ).toBe(true);
      }
    },
  );

  it.each(["scene", "object", "event"] as const)(
    "normalizes duplicate V1 %s order values for V2",
    (kind) => {
      const source = EngineProjectV1.parse(
        JSON.parse(fixture("v1-project.json")),
      );
      if (kind === "scene") {
        source.scenes[0]!.order = Number.MAX_SAFE_INTEGER;
        const scene = structuredClone(source.scenes[0]!);
        scene.id = "550e8400-e29b-41d4-a716-446655440020";
        scene.objects[0]!.id = "550e8400-e29b-41d4-a716-446655440021";
        scene.objects[0]!.components[0]!.id =
          "550e8400-e29b-41d4-a716-446655440022";
        const dialogue = scene.objects[0]!.components[0]!.properties as {
          choices: Array<{ id: string }>;
        };
        dialogue.choices[0]!.id = "550e8400-e29b-41d4-a716-446655440023";
        source.scenes.push(scene);
      } else if (kind === "object") {
        const object = structuredClone(source.scenes[0]!.objects[0]!);
        object.id = "550e8400-e29b-41d4-a716-446655440024";
        object.components[0]!.id = "550e8400-e29b-41d4-a716-446655440025";
        const dialogue = object.components[0]!.properties as {
          choices: Array<{ id: string }>;
        };
        dialogue.choices[0]!.id = "550e8400-e29b-41d4-a716-446655440026";
        source.scenes[0]!.objects.push(object);
      } else {
        const event = structuredClone(source.events[0]!);
        event.id = "550e8400-e29b-41d4-a716-446655440027";
        event.actions[0]!.id = "550e8400-e29b-41d4-a716-446655440028";
        if (event.condition) {
          event.condition.id = "550e8400-e29b-41d4-a716-44665544002b";
        }
        source.events.push(event);
      }

      expect(EngineProjectV1.safeParse(source).success).toBe(true);
      expect(
        EngineProjectV2.safeParse(upgradeEngineProjectV1(source)).success,
      ).toBe(true);
    },
  );

  it("bounds newly constrained V2 geometry and animation defaults", () => {
    const source = EngineProjectV1.parse(
      JSON.parse(fixture("v1-project.json")),
    );
    const prefabTransform = source.prefabs[0]!.components[0]!;
    if (prefabTransform.type !== "Transform") throw new Error("fixture drift");
    prefabTransform.properties.rotation = 500_000;
    prefabTransform.properties.scaleX = 2_000;
    source.scenes[0]!.objects[0]!.components.push(
      {
        id: "550e8400-e29b-41d4-a716-446655440029",
        type: "Shape",
        version: 1,
        properties: {
          kind: "RECTANGLE",
          width: 100_000,
          height: 100_000,
          color: "#ffffff",
        },
      },
      {
        id: "550e8400-e29b-41d4-a716-44665544002a",
        type: "Animation",
        version: 1,
        properties: {
          activeClip: "idle",
          autoplay: true,
          playbackRate: 0.000_001,
        },
      },
    );

    expect(EngineProjectV1.safeParse(source).success).toBe(true);
    expect(
      EngineProjectV2.safeParse(upgradeEngineProjectV1(source)).success,
    ).toBe(true);
  });

  it.each(["object", "prefab"] as const)(
    "losslessly wraps additional V1 %s transforms",
    (container) => {
      const source = EngineProjectV1.parse(
        JSON.parse(fixture("v1-project.json")),
      );
      const components =
        container === "object"
          ? source.scenes[0]!.objects[0]!.components
          : source.prefabs[0]!.components;
      if (container === "object") {
        components.push({
          id: "550e8400-e29b-41d4-a716-44665544002d",
          type: "Transform",
          version: 1,
          properties: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        });
      }
      components.push({
        id: "550e8400-e29b-41d4-a716-44665544002c",
        type: "Transform",
        version: 1,
        properties: {
          x: 10,
          y: 20,
          rotation: 30,
          scaleX: 2,
          scaleY: 3,
        },
      });

      const upgraded = upgradeEngineProjectV1(source);
      expect(EngineProjectV2.safeParse(upgraded).success).toBe(true);
      const upgradedComponents =
        container === "object"
          ? upgraded.scenes[0]!.objects[0]!.components
          : upgraded.prefabs[0]!.components;
      expect(
        upgradedComponents.filter(
          (component) => component.type === "Transform",
        ),
      ).toHaveLength(1);
      expect(upgradedComponents).toContainEqual(
        expect.objectContaining({
          id: "550e8400-e29b-41d4-a716-44665544002c",
          type: "Custom",
          properties: {
            definitionKey: "tfg.v1.transform",
            config: {
              x: 10,
              y: 20,
              rotation: 30,
              scaleX: 2,
              scaleY: 3,
            },
          },
        }),
      );
    },
  );
});
