import { describe, expect, it } from "vitest";
import {
  ApplyMutationBatchInput,
  EngineProjectV2,
  applyProjectMutations,
  JSON_REQUEST_BYTE_LIMIT,
  mutationBatchRequestBytes,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import {
  createStudioState,
  createStudioTransport,
  type StudioMutation,
} from "../components/studio/studio-state";
import { studioReducer } from "../components/studio/studio-reducer";
import {
  recoveryEnvelope,
  restoreRecovery,
} from "../components/studio/studio-recovery";

import * as api from "../components/studio/object-commands";
const id = (value: number) =>
  `550e8400-e29b-41d4-a716-${String(value).padStart(12, "0")}`;
const identity = { userId: "owner", gameId: "game", projectId: id(1) };
function project(): EngineProjectV2Type {
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [],
    scenes: [
      {
        id: id(2),
        name: "Scene",
        key: "scene",
        order: 0,
        type: "MIXED",
        width: 640,
        height: 480,
        background: { color: "#000000", assetId: null },
        settings: {
          gravityX: 0,
          gravityY: 0,
          grid: { enabled: false, size: 32, snap: false },
        },
        layers: ["WORLD", "UI", "COLLISION"].map((type, order) => ({
          id: id(3 + order),
          name: type,
          type,
          order,
          visible: true,
          locked: false,
        })),
        objects: [],
      },
    ],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  });
}
const newIds = () => {
  let next = 100;
  return () => id(next++);
};

it("creates an explicit per-object pivot override and a top-left tile pivot in canonical commands", () => {
  const input = project();
  const custom = api.createObjectCommand(
    input.scenes[0],
    {
      objectType: "PLAYER",
      name: "Feet",
      layerId: id(3),
      transform: { pivot: { x: 0.5, y: 1 } },
    },
    newIds(),
  );
  expect(custom.type).toBe("object.create");
  if (custom.type === "object.create")
    expect(custom.objects[0].object.components[0].properties).toHaveProperty(
      "pivot",
      { x: 0.5, y: 1 },
    );
  const tile = api.createObjectCommand(
    input.scenes[0],
    {
      objectType: "TILEMAP",
      name: "Tiles",
      layerId: id(3),
    },
    newIds(),
  );
  if (tile.type === "object.create")
    expect(tile.objects[0].object.components[0].properties).toHaveProperty(
      "pivot",
      { x: 0, y: 0 },
    );
});
const commit = (
  state: ReturnType<typeof createStudioState>,
  mutations: StudioMutation[],
) =>
  studioReducer(state, {
    type: "commit",
    mutations,
    mutationId: "edit",
    timestamp: 1,
  });

describe("shared object command primitives", () => {
  it("review2-origin: rejects same-layer component ownership before optimistic commit", () => {
    const input = project();
    const allocate = newIds();
    let document = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "CUSTOM", name: "First", layerId: id(3) },
        allocate,
      ),
    ]);
    document = applyProjectMutations(document, [
      api.createObjectCommand(
        document.scenes[0],
        { objectType: "CUSTOM", name: "Second", layerId: id(3) },
        allocate,
      ),
    ]);
    const state = createStudioState(identity, { revision: 0, document });
    const commands: StudioMutation[] = [
      api.addComponentCommand(id(2), id(100), "Health", undefined, () =>
        id(104),
      ),
      { type: "layer.delete", sceneId: id(2), layerId: id(3), confirmed: true },
    ];
    const before = structuredClone({ state, commands });
    expect(() => commit(state, commands)).toThrow(
      /Same-layer stable IDs must be unique/,
    );
    expect({ state, commands }).toEqual(before);
  });

  it("review2-origin: rejects ambiguous object deletion without changing Studio history", () => {
    const input = project();
    const scene = {
      ...input.scenes[0],
      id: id(500),
      key: "carrier",
      order: 1,
      layers: input.scenes[0].layers
        .slice(0, 2)
        .map((layer, index) => ({
          ...layer,
          id: id(501 + index),
          type: "WORLD" as const,
        })),
      objects: [] as EngineProjectV2Type["scenes"][number]["objects"],
    };
    const creation = api.createObjectCommand(
      scene,
      { objectType: "CUSTOM", name: "Owned", layerId: id(501) },
      newIds(),
    );
    if (creation.type !== "object.create")
      throw new Error("Missing object creation");
    const owned = creation.objects[0].object;
    scene.objects = [owned, { ...structuredClone(owned), layerId: id(502) }];
    const commands: StudioMutation[] = [
      {
        type: "scene.create",
        scene,
        variables: null,
        beforeSceneId: null,
        entry: false,
      },
      {
        type: "object.delete",
        sceneId: scene.id,
        objectIds: [owned.id],
        confirmed: true,
      },
    ];
    const state = createStudioState(identity, { revision: 0, document: input });
    const before = structuredClone({ state, commands });
    expect(() => commit(state, commands)).toThrow(/Ambiguous object ID/);
    expect({ state, commands }).toEqual(before);
  });

  it.each([false, true])(
    "review2: replays cross-layer collision carriers through Studio and transport (exact %s)",
    (exact) => {
      const input = project();
      const scene = {
        ...input.scenes[0],
        id: id(500),
        key: "carrier",
        order: 1,
        layers: input.scenes[0].layers.slice(0, 2).map((layer, index) => ({
          ...layer,
          id: id(501 + index),
          type: "WORLD" as const,
        })),
        objects: [] as EngineProjectV2Type["scenes"][number]["objects"],
      };
      const creation = api.createObjectCommand(
        scene,
        { objectType: "CUSTOM", name: "Owned", layerId: id(501) },
        newIds(),
      );
      if (creation.type !== "object.create")
        throw new Error("Missing object creation");
      const owned = creation.objects[0].object;
      scene.objects = [
        owned,
        { ...structuredClone(owned), name: "Survivor", layerId: id(502) },
      ];
      const commands: StudioMutation[] = [
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
          layerId: id(501),
          ...(exact ? { objectIds: [owned.id] } : {}),
          confirmed: true,
        },
      ];
      const before = structuredClone({ input, commands });
      const state = commit(
        createStudioState(identity, { revision: 0, document: input }),
        commands,
      );
      const inverse = ApplyMutationBatchInput.parse({
        baseRevision: 1,
        mutationId: "undo",
        mutations: state.history.past.at(-1)!.undo,
      });
      expect(mutationBatchRequestBytes(inverse.mutations)).toBeLessThanOrEqual(
        JSON_REQUEST_BYTE_LIMIT,
      );
      expect(inverse.mutations.length).toBeLessThanOrEqual(100);
      expect(applyProjectMutations(state.document, inverse.mutations)).toEqual(
        input,
      );
      const undone = studioReducer(state, {
        type: "undo",
        mutationId: "undo",
        timestamp: 2,
      });
      expect(undone.document).toEqual(input);
      expect(
        studioReducer(undone, {
          type: "redo",
          mutationId: "redo",
          timestamp: 3,
        }).document,
      ).toEqual(state.document);
      expect(
        restoreRecovery(
          createStudioState(identity, { revision: 0, document: input }),
          recoveryEnvelope(undone),
        ).document,
      ).toEqual(input);
      expect({ input, commands }).toEqual(before);
    },
  );

  it.each(["create", "duplicate"])(
    "review: transports exact layer %s ownership through undo/redo",
    (kind) => {
      const input = project();
      const allocate = newIds();
      let document = applyProjectMutations(input, [
        api.createObjectCommand(
          input.scenes[0],
          { objectType: "CUSTOM", name: "Moved", layerId: id(3) },
          allocate,
        ),
      ]);
      document = applyProjectMutations(document, [
        api.createObjectCommand(
          document.scenes[0],
          { objectType: "CUSTOM", name: "Source", layerId: id(3) },
          allocate,
        ),
      ]);
      const before = createStudioState(identity, { revision: 0, document });
      const layerId = id(500);
      const layer: StudioMutation =
        kind === "create"
          ? {
              type: "layer.create",
              sceneId: id(2),
              layer: {
                ...document.scenes[0].layers[0],
                id: layerId,
                order: 10,
              },
              objects: [],
              beforeLayerId: null,
            }
          : {
              type: "layer.duplicate",
              sceneId: id(2),
              layerId: id(3),
              newId: layerId,
              name: "Copy",
            };
      const state = commit(before, [
        api.updateObjectCommand(id(2), id(100), { layerId, order: 0 }),
        layer,
      ]);
      const inverse = ApplyMutationBatchInput.parse({
        baseRevision: 1,
        mutationId: "undo",
        mutations: state.history.past.at(-1)!.undo,
      });
      expect(inverse.mutations.length).toBeLessThanOrEqual(100);
      expect(mutationBatchRequestBytes(inverse.mutations)).toBeLessThanOrEqual(
        JSON_REQUEST_BYTE_LIMIT,
      );
      expect(applyProjectMutations(state.document, inverse.mutations)).toEqual(
        document,
      );
      const undone = studioReducer(state, {
        type: "undo",
        mutationId: "undo",
        timestamp: 2,
      });
      expect(undone.document).toEqual(document);
      expect(
        studioReducer(undone, {
          type: "redo",
          mutationId: "redo",
          timestamp: 3,
        }).document,
      ).toEqual(state.document);
      expect(
        restoreRecovery(
          createStudioState(identity, { revision: 0, document }),
          recoveryEnvelope(undone),
        ).document,
      ).toEqual(document);
    },
  );

  it("review: rejects duplicate/remove ID collisions before optimistic state or history changes", () => {
    const input = project();
    const allocate = newIds();
    let document = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "CUSTOM", name: "Source", layerId: id(3) },
        allocate,
      ),
    ]);
    document = applyProjectMutations(document, [
      api.createObjectCommand(
        document.scenes[0],
        { objectType: "CUSTOM", name: "Existing", layerId: id(3) },
        allocate,
      ),
    ]);
    const state = createStudioState(identity, { revision: 0, document });
    const commands = [
      api.duplicateObjectCommand(id(2), id(100), id(103), "Collision"),
      api.deleteObjectCommand(document.scenes[0], id(103), true),
    ];
    const before = structuredClone({ state, commands });
    expect(() => commit(state, commands)).toThrow(/Stable ID already exists/);
    expect({ state, commands }).toEqual(before);
  });

  it.each([
    "name",
    "parentId",
    "layerId",
    "enabled",
    "visible",
    "locked",
    "order",
    "renderOrder",
  ])("review: command creators reject explicit undefined %s", (field) => {
    const changes = { [field]: undefined };
    expect(() => api.updateObjectCommand(id(2), id(100), changes)).toThrow(
      /undefined|defined/,
    );
    expect(changes).toHaveProperty(field, undefined);
  });

  it.each([
    [
      "PLAYER",
      ["Transform", "SpriteRenderer", "Movement", "Collider", "Health"],
    ],
    ["NPC", ["Transform", "SpriteRenderer", "Dialogue", "Interactable"]],
    ["ITEM", ["Transform", "SpriteRenderer", "InventoryItem"]],
    ["TRIGGER", ["Transform", "Trigger", "Collider"]],
    ["UI", ["Transform", "UIPanel"]],
    ["DECORATION", ["Transform", "SpriteRenderer"]],
    ["CUSTOM", ["Transform", "Custom"]],
  ] as const)(
    "authors %s as a canonical component composition with positioned Transform",
    (objectType, expectedTypes) => {
      const input = project();
      const command = api.createObjectCommand(
        input.scenes[0],
        {
          objectType,
          name: "Created",
          layerId: objectType === "UI" ? id(4) : id(3),
          transform: {
            x: 120,
            y: -40,
            width: 64,
            height: 48,
            rotation: 25,
            scaleX: -2,
            scaleY: 3,
          },
          renderOrder: -8,
        },
        newIds(),
      );
      const state = commit(
        createStudioState(identity, { revision: 0, document: input }),
        [command],
      );
      const object = state.document.scenes[0].objects[0];
      expect(object).toMatchObject({
        id: id(100),
        name: "Created",
        objectType,
        enabled: true,
        visible: true,
        locked: false,
        renderOrder: -8,
      });
      expect(object.components.map((component) => component.type)).toEqual(
        expectedTypes,
      );
      expect(object.components[0].properties).toEqual({
        x: 120,
        y: -40,
        width: 64,
        height: 48,
        rotation: 25,
        scaleX: -2,
        scaleY: 3,
        pivot: { x: 0.5, y: 0.5 },
      });
      if (objectType === "PLAYER")
        expect(
          object.components.find((value) => value.type === "Movement")
            ?.properties,
        ).toMatchObject({ controls: "PLAYER" });
      if (objectType === "TRIGGER")
        expect(
          object.components.find((value) => value.type === "Collider")
            ?.properties,
        ).toMatchObject({ isTrigger: true });
      expect(state.pending?.mutations).toEqual([command]);
      const undo = studioReducer(state, {
        type: "undo",
        mutationId: "undo",
        timestamp: 2,
      });
      expect(undo.document).toEqual(input);
      expect(
        studioReducer(undo, { type: "redo", mutationId: "redo", timestamp: 3 })
          .document,
      ).toEqual(state.document);
      expect(
        restoreRecovery(
          createStudioState(identity, { revision: 0, document: input }),
          recoveryEnvelope(state),
        ).document,
      ).toEqual(state.document);
    },
  );

  it("deletes every descendant across layers in one transportable command and restores exact stable IDs", () => {
    const initial = project();
    const allocate = newIds();
    let document = applyProjectMutations(initial, [
      api.createObjectCommand(
        initial.scenes[0],
        { objectType: "CUSTOM", name: "Parent", layerId: id(3) },
        allocate,
      ),
    ]);
    const rootId = document.scenes[0].objects[0].id;
    document = applyProjectMutations(document, [
      api.createObjectCommand(
        document.scenes[0],
        { objectType: "UI", name: "Child", layerId: id(4), parentId: rootId },
        allocate,
      ),
    ]);
    const childId = document.scenes[0].objects[1].id;
    document = applyProjectMutations(document, [
      api.createObjectCommand(
        document.scenes[0],
        {
          objectType: "DECORATION",
          name: "Grandchild",
          layerId: id(3),
          parentId: childId,
        },
        allocate,
      ),
    ]);
    document.scenes[0].objects.reverse();
    const command = api.deleteObjectCommand(document.scenes[0], rootId, true);
    const state = commit(
      createStudioState(identity, { revision: 0, document }),
      [command],
    );
    expect(state.document.scenes[0].objects).toEqual([]);
    expect(state.pending?.mutations).toHaveLength(1);
    expect(
      studioReducer(state, { type: "undo", mutationId: "undo", timestamp: 2 })
        .document,
    ).toEqual(document);
    expect(() =>
      api.deleteObjectCommand(document.scenes[0], id(9999), true),
    ).toThrow();
    expect(() =>
      api.deleteObjectCommand(document.scenes[0], rootId, false as true),
    ).toThrow();
  });

  it("duplicates objects and updates hierarchy, flags, layer, and render order through the shared reducer", () => {
    const input = project();
    const created = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "DECORATION", name: "Tree", layerId: id(3) },
        newIds(),
      ),
    ]);
    const duplicate = api.duplicateObjectCommand(
      id(2),
      id(100),
      id(200),
      "Copy",
    );
    const state = commit(
      createStudioState(identity, { revision: 0, document: created }),
      [
        duplicate,
        api.updateObjectCommand(id(2), id(200), {
          name: "Renamed",
          parentId: id(100),
          visible: false,
          enabled: false,
          locked: true,
          layerId: id(5),
          order: 7,
          renderOrder: 20,
        }),
      ],
    );
    expect(state.document.scenes[0].objects[1]).toMatchObject({
      id: id(200),
      name: "Renamed",
      parentId: id(100),
      visible: false,
      enabled: false,
      locked: true,
      layerId: id(5),
      order: 7,
      renderOrder: 20,
    });
    expect(
      studioReducer(state, { type: "undo", mutationId: "undo", timestamp: 2 })
        .document,
    ).toEqual(created);
  });

  it("assigns next object order per layer and reorders by supplied stable IDs", () => {
    const initial = project();
    const allocate = newIds();
    let document = applyProjectMutations(initial, [
      api.createObjectCommand(
        initial.scenes[0],
        { objectType: "DECORATION", name: "First", layerId: id(3) },
        allocate,
      ),
    ]);
    document.scenes[0].objects[0].order = 40;
    document = applyProjectMutations(document, [
      api.createObjectCommand(
        document.scenes[0],
        { objectType: "DECORATION", name: "Second", layerId: id(3) },
        allocate,
      ),
    ]);
    const [first, second] = document.scenes[0].objects;
    expect(second.order).toBe(41);
    const state = commit(
      createStudioState(identity, { revision: 0, document }),
      [api.reorderObjectsCommand(id(2), id(3), [second.id, first.id])],
    );
    expect(
      state.document.scenes[0].objects.map((object) => object.order),
    ).toEqual([1, 0]);
    expect(
      studioReducer(state, { type: "undo", mutationId: "undo", timestamp: 2 })
        .document,
    ).toEqual(document);
  });

  it("adds registry defaults, updates component properties, and removes by stable ID without aliasing", () => {
    const input = project();
    const created = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "DECORATION", name: "Tree", layerId: id(3) },
        newIds(),
      ),
    ]);
    const config = {
      definitionKey: "custom.settings",
      config: { nested: { value: "original" } },
    };
    const command = api.addComponentCommand(
      id(2),
      id(100),
      "Custom",
      config,
      () => id(200),
    );
    config.config.nested.value = "caller";
    let state = commit(
      createStudioState(identity, { revision: 0, document: created }),
      [
        command,
        api.addComponentCommand(id(2), id(100), "Health", undefined, () =>
          id(201),
        ),
      ],
    );
    const object = state.document.scenes[0].objects[0];
    expect(
      object.components.find((value) => value.id === id(200))?.properties,
    ).toMatchObject({ config: { nested: { value: "original" } } });
    expect(
      object.components.find((value) => value.id === id(201))?.properties,
    ).toEqual({ current: 100, maximum: 100 });
    state = commit(state, [
      api.updateComponentCommand(id(2), id(100), id(201), {
        current: 20,
        maximum: 80,
      }),
      api.removeComponentCommand(id(2), id(100), id(200)),
    ]);
    expect(
      state.document.scenes[0].objects[0].components.find(
        (value) => value.id === id(201),
      )?.properties,
    ).toEqual({ current: 20, maximum: 80 });
    expect(
      state.document.scenes[0].objects[0].components.some(
        (value) => value.id === id(200),
      ),
    ).toBe(false);
  });

  it("refuses a delete when its generated inverse exceeds the 4 MiB request budget", () => {
    const input = project();
    const created = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "CUSTOM", name: "Large", layerId: id(3) },
        newIds(),
      ),
    ]);
    created.scenes[0].objects[0].components[1].properties = {
      definitionKey: "custom.large",
      config: { text: "x".repeat(JSON_REQUEST_BYTE_LIMIT) },
    };
    const before = createStudioState(identity, {
      revision: 0,
      document: created,
    });
    const state = commit(before, [
      api.deleteObjectCommand(created.scenes[0], id(100), true),
    ]);
    expect(state.commandError).toMatch(/4 MiB/);
    expect(state.document).toEqual(before.document);
    expect(state.pending).toBeNull();
    expect(state.history).toEqual(before.history);
  });

  it("queues 101 object edits in <=100-command batches and persists exact inverse replay through transport", async () => {
    const input = project();
    const created = applyProjectMutations(input, [
      api.createObjectCommand(
        input.scenes[0],
        { objectType: "DECORATION", name: "Tree", layerId: id(3) },
        newIds(),
      ),
    ]);
    let state = createStudioState(identity, { revision: 0, document: created });
    for (let index = 0; index < 101; index += 1)
      state = commit(state, [
        api.updateObjectCommand(id(2), id(100), { name: `Name ${index}` }),
      ]);
    expect(state.pending?.mutations).toHaveLength(100);
    expect(state.queued).toHaveLength(1);
    const requests: ApplyMutationBatchInput[] = [];
    let server = created;
    let revision = 0;
    const transport = createStudioTransport(async (_url, options) => {
      const batch = ApplyMutationBatchInput.parse(
        JSON.parse(String(options?.body)),
      );
      expect(batch.baseRevision).toBe(revision);
      expect(mutationBatchRequestBytes(batch.mutations)).toBeLessThanOrEqual(
        JSON_REQUEST_BYTE_LIMIT,
      );
      requests.push(batch);
      server = applyProjectMutations(server, batch.mutations);
      revision += 1;
      return new Response(
        JSON.stringify({
          status: "SUPPORTED",
          project: server,
          revision: {
            revisionNumber: revision,
            schemaVersion: 2,
            contentHash: "a".repeat(64),
            byteSize: 1,
            retention: "STANDARD",
            createdAt: "2026-09-09T00:00:00.000Z",
          },
        }),
      );
    }, "https://studio.test");
    while (state.pending) {
      const pending = state.pending;
      const acknowledged = await transport(identity.gameId, pending);
      state = studioReducer(state, {
        type: "acknowledged",
        savedMutationId: pending.mutationId,
        acknowledged,
        mutationId: `ack-${revision}`,
        timestamp: revision,
      });
    }
    expect(requests.map((batch) => batch.mutations.length)).toEqual([100, 1]);
    expect(server.scenes[0].objects[0].name).toBe("Name 100");
    state = studioReducer(state, {
      type: "undo",
      mutationId: "undo",
      timestamp: 102,
    });
    const undone = await transport(identity.gameId, state.pending!);
    expect(undone.document.scenes[0].objects[0].name).toBe("Name 99");
  });
});
