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
