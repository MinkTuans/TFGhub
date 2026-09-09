import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  applyProjectMutations,
  applyProjectMutationsWithHistory,
  EngineProjectV2,
  ApplyMutationBatchInput,
  type EngineProjectV2Type,
  type GameSummary,
} from "@indieforge/contracts";
import {
  StudioProvider,
  useStudio,
} from "../components/studio/studio-provider";
import { StudioShell } from "../components/studio/studio-shell";
import { createStudioState } from "../components/studio/studio-state";
import { studioReducer } from "../components/studio/studio-reducer";
import {
  recoveryEnvelope,
  restoreRecovery,
} from "../components/studio/studio-recovery";

const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const identity = { userId: "owner", gameId: "game", projectId: id(1) };
function project(): EngineProjectV2Type {
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [],
    scenes: [2, 3].map((n) => ({
      id: id(n),
      key: `scene-${n}`,
      name: n === 2 ? "Opening" : "Ending",
      order: n * 3,
      type: "MIXED",
      width: 640,
      height: 480,
      background: { color: "#102030", assetId: null },
      settings: {
        gravityX: 0,
        gravityY: 0,
        grid: { enabled: false, size: 32, snap: false },
      },
      layers: [4, 5].map((l) => ({
        id: id(n * 10 + l),
        name: l === 4 ? "World" : "Second",
        order: l * 4,
        type: "WORLD",
        visible: true,
        locked: false,
      })),
      objects: [6, 7, 8].map((o) => ({
        id: id(n * 10 + o),
        name: `Object ${o}`,
        objectType: "CUSTOM",
        parentId: o === 7 ? id(n * 10 + 6) : null,
        layerId: id(n * 10 + (o === 8 ? 5 : 4)),
        enabled: true,
        visible: true,
        locked: false,
        order: o,
        renderOrder: o,
        components: [
          {
            id: id(n * 100 + o),
            version: 1,
            type: "Transform",
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
        ],
      })),
    })),
    variables: {
      global: [],
      player: [],
      scene: {
        [id(2)]: [
          { id: id(400), name: "Local", type: "NUMBER", initialValue: 9 },
        ],
      },
    },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  });
}
const metadata = { mutationId: "edit", timestamp: 1 };

function customLayer(p: EngineProjectV2Type) {
  const config = { nested: { value: "original" } };
  const mutation: ApplyMutationBatchInput["mutations"][number] = {
    type: "layer.create",
    sceneId: id(2),
    layer: { ...p.scenes[0].layers[0], id: id(50), order: 50 },
    beforeLayerId: null,
    objects: [
      {
        object: {
          ...p.scenes[0].objects[0],
          id: id(500),
          layerId: id(50),
          components: [
            { ...p.scenes[0].objects[0].components[0], id: id(501) },
            {
              id: id(502),
              type: "Custom",
              version: 1,
              properties: { definitionKey: "custom.payload", config },
            },
          ],
        },
        beforeObjectId: null,
      },
    ],
  };
  return { mutation, config };
}

test.each([false, true])(
  "detaches nested command payloads from %s queued state through attempts, retry and recovery",
  (queued) => {
    const before = project();
    const initial = createStudioState(identity, {
      revision: 4,
      document: before,
    });
    let state = initial;
    if (queued) {
      state = studioReducer(state, {
        type: "commit",
        mutations: [{ type: "scene.rename", sceneId: id(3), name: "First" }],
        ...metadata,
      });
      state = studioReducer(state, {
        type: "persisted",
        version: state.version,
      });
      state = studioReducer(state, {
        type: "save-started",
        version: state.version,
      });
    }
    const { mutation, config } = customLayer(before);
    state = studioReducer(state, {
      type: "commit",
      mutations: [mutation],
      ...metadata,
    });
    const committed = structuredClone(state);
    config.nested.value = "caller changed after commit";
    expect(state).toEqual(committed);
    if (queued) {
      state = studioReducer(state, {
        type: "acknowledged",
        savedMutationId: state.pending!.mutationId,
        acknowledged: {
          revision: 5,
          document: applyProjectMutations(before, state.pending!.mutations),
        },
        mutationId: "promoted",
        timestamp: 2,
      });
    }
    state = studioReducer(state, { type: "persisted", version: state.version });
    state = studioReducer(state, {
      type: "save-started",
      version: state.version,
    });
    const attempted = structuredClone(state.pending);
    config.nested.value = "caller changed after attempt";
    state = studioReducer(state, {
      type: "save-failed",
      savedMutationId: state.pending!.mutationId,
      conflict: false,
      currentRevision: null,
      timestamp: 3,
    });
    state = studioReducer(state, { type: "retry", ...metadata });
    expect(state.pending).toEqual(attempted);
    const envelope = recoveryEnvelope(state);
    const recovered = restoreRecovery(initial, envelope);
    expect(recovered.document).toEqual(committed.document);
    const snapshot = structuredClone(recovered);
    const restorePayload = envelope.pending!.mutations[0];
    if (restorePayload.type !== "layer.create")
      throw new Error("Expected custom layer");
    const properties = restorePayload.objects[0].object.components[1]
      .properties as { config: { nested: { value: string } } };
    properties.config.nested.value = "storage changed after restore";
    expect(recovered).toEqual(snapshot);
    const undo = studioReducer(state, { type: "undo", ...metadata });
    const redo = studioReducer(undo, { type: "redo", ...metadata });
    expect(redo.document).toEqual(committed.document);
    expect(state.pending).toEqual(attempted);
  },
);

test("detaches preview command payloads before a later commit-preview", () => {
  const before = project();
  const initial = createStudioState(identity, {
    revision: 4,
    document: before,
  });
  const { mutation, config } = customLayer(before);
  const preview = studioReducer(initial, {
    type: "preview",
    mutations: [mutation],
  });
  const expected = structuredClone(preview.preview!.document);
  config.nested.value = "caller changed preview";
  const committed = studioReducer(preview, {
    type: "commit-preview",
    ...metadata,
  });
  expect(committed.document).toEqual(expected);
});

test("detaches opaque queued recovery payloads from the storage envelope", () => {
  const initial = createStudioState(identity, {
    revision: 4,
    document: project(),
  });
  const { mutation, config } = customLayer(initial.document);
  const envelope = {
    ...recoveryEnvelope(initial),
    pending: {
      baseRevision: 4,
      mutationId: "attempted",
      mutations: [
        { type: "scene.rename" as const, sceneId: id(3), name: "First" },
      ],
    },
    queued: [mutation],
  };
  const recovered = restoreRecovery(initial, envelope);
  const snapshot = structuredClone(recovered);
  config.nested.value = "storage changed queued payload";
  expect(recovered).toEqual(snapshot);
});

test.each(["layers", "objects"] as const)(
  "sends replayable inverse snapshots through the API schema at a temporary %s overflow",
  (collection) => {
    const before = project();
    const scene = before.scenes[0];
    if (collection === "layers") {
      scene.layers.push(
        ...Array.from({ length: 98 }, (_, order) => ({
          ...scene.layers[0],
          id: id(1000 + order),
          order: 100 + order,
        })),
      );
    } else {
      scene.objects = Array.from({ length: 1000 }, (_, order) => ({
        ...scene.objects[0],
        id: id(5000 + order),
        order,
        parentId: null,
        components: [
          { ...scene.objects[0].components[0], id: id(7000 + order) },
        ],
      }));
    }
    const { mutation } = customLayer(before);
    const commands: ApplyMutationBatchInput["mutations"] = [
      mutation,
      {
        type: "scene.delete",
        sceneId: id(2),
        replacementSceneId: id(3),
        confirmed: true,
      },
      { type: "scene.rename", sceneId: id(3), name: "Kept" },
    ];
    const result = applyProjectMutationsWithHistory(before, commands);
    const wire = ApplyMutationBatchInput.parse({
      baseRevision: 5,
      mutationId: "undo",
      mutations: result.undo,
    });
    expect(applyProjectMutations(result.document, wire.mutations)).toEqual(
      before,
    );
    const initial = createStudioState(identity, {
      revision: 4,
      document: before,
    });
    const state = studioReducer(initial, {
      type: "commit",
      mutations: commands,
      ...metadata,
    });
    const undone = studioReducer(state, { type: "undo", ...metadata });
    expect(undone.document).toEqual(before);
    const redone = studioReducer(undone, { type: "redo", ...metadata });
    expect(redone.document).toEqual(result.document);
    expect(() => applyProjectMutations(before, [mutation])).toThrow();
  },
);

test.each([-1, 0, 1])(
  "preflights actual command bytes at the 4 MiB envelope boundary delta %i",
  (delta) => {
    const before = project();
    const initial = createStudioState(identity, {
      revision: 4,
      document: before,
    });
    const { mutation, config } = customLayer(before);
    config.nested.value = "界".repeat(128);
    // Worst legal id consists of 128 JSON-escaped non-whitespace control chars.
    // Buffer measures the actual UTF-8 wire independently of Studio's helper.
    const overhead = Buffer.byteLength(
      JSON.stringify({
        baseRevision: 2_147_483_646,
        mutationId: "\0".repeat(128),
        mutations: [mutation],
      }),
    );
    config.nested.value += "x".repeat(4 * 1024 * 1024 - overhead + delta);
    const result = studioReducer(initial, {
      type: "commit",
      mutations: [mutation],
      ...metadata,
    });
    if (delta <= 0) {
      expect(result.document.scenes[0].objects).toHaveLength(4);
      expect(result.history.past).toHaveLength(1);
    } else {
      expect(result.document === initial.document).toBe(true);
      expect(result.history).toBe(initial.history);
      expect(result.pending).toBeNull();
      expect(result.queued).toEqual([]);
      expect(result.version).toBe(initial.version);
    }
  },
  20_000,
);

test("rejects a compact gesture with an oversized inverse visibly without changing durable state", async () => {
  const before = project();
  before.scenes[0].objects[0].components.push({
    id: id(900),
    type: "Custom",
    version: 1,
    properties: {
      definitionKey: "custom.large",
      config: { text: "x".repeat(1_500_000) },
    },
  });
  const h = await shell(before);
  const snapshot = h.studio.state;
  const mutations: ApplyMutationBatchInput["mutations"] = [
    {
      type: "layer.duplicate",
      sceneId: id(2),
      layerId: id(24),
      newId: id(50),
      name: "Copy1",
    },
    {
      type: "layer.duplicate",
      sceneId: id(2),
      layerId: id(24),
      newId: id(51),
      name: "Copy2",
    },
    {
      type: "scene.delete",
      sceneId: id(2),
      replacementSceneId: id(3),
      confirmed: true,
    },
  ];
  expect(Buffer.byteLength(JSON.stringify(mutations))).toBeLessThan(1024);
  await act(async () => h.studio.dispatch({ type: "commit", mutations }));
  expect(h.studio.state.document === snapshot.document).toBe(true);
  expect(h.studio.state.history).toBe(snapshot.history);
  expect(h.studio.state.pending).toBe(snapshot.pending);
  expect(h.studio.state.queued).toBe(snapshot.queued);
  expect(h.studio.state.version).toBe(snapshot.version);
  expect(screen.getByRole("alert")).toHaveTextContent(/4 MiB/);
  expect(h.batches).toEqual([]);
}, 20_000);

test("does not combine separately transportable gestures into an oversized outgoing batch", () => {
  const before = project();
  const initial = createStudioState(identity, {
    revision: 4,
    document: before,
  });
  const first = customLayer(before);
  first.config.nested.value = "x".repeat(2_100_000);
  let state = studioReducer(initial, {
    type: "commit",
    mutations: [first.mutation],
    ...metadata,
  });
  const second = structuredClone(first.mutation);
  if (second.type !== "layer.create") throw new Error("Expected layer");
  second.layer.id = id(60);
  second.layer.order = 60;
  second.objects[0].object.id = id(600);
  second.objects[0].object.layerId = id(60);
  second.objects[0].object.components.forEach((component, n) => {
    component.id = id(601 + n);
  });
  state = studioReducer(state, {
    type: "commit",
    mutations: [second],
    ...metadata,
  });
  expect(state.pending!.mutations).toHaveLength(1);
  expect(state.queued).toEqual([second]);
  const saved = applyProjectMutations(before, state.pending!.mutations);
  const next = studioReducer(state, {
    type: "acknowledged",
    savedMutationId: state.pending!.mutationId,
    acknowledged: { revision: 5, document: saved },
    mutationId: "promoted",
    timestamp: 2,
  });
  expect(next.pending!.mutations).toEqual([second]);
  expect(applyProjectMutations(saved, next.pending!.mutations)).toEqual(
    state.document,
  );
}, 20_000);

const commands: Array<{
  name: string;
  build: (p: EngineProjectV2Type) => unknown;
}> = [
  {
    name: "scene create",
    build: (p) => ({
      type: "scene.create",
      scene: {
        ...p.scenes[1],
        id: id(50),
        key: "new",
        order: 50,
        layers: [{ ...p.scenes[1].layers[0], id: id(51) }],
        objects: [],
      },
      variables: [],
      beforeSceneId: id(2),
      entry: true,
    }),
  },
  {
    name: "scene rename",
    build: () => ({ type: "scene.rename", sceneId: id(2), name: "Renamed" }),
  },
  {
    name: "scene settings",
    build: () => ({
      type: "scene.update",
      sceneId: id(2),
      changes: {
        type: "MAP",
        width: 1234,
        height: 600,
        settings: {
          gravityX: -8,
          gravityY: 250,
          grid: { enabled: true, size: 16, snap: true },
        },
      },
    }),
  },
  {
    name: "scene duplicate",
    build: () => ({
      type: "scene.duplicate",
      sceneId: id(2),
      newId: id(50),
      name: "Copy",
      key: "copy",
    }),
  },
  {
    name: "entry scene delete",
    build: () => ({
      type: "scene.delete",
      sceneId: id(2),
      replacementSceneId: id(3),
      confirmed: true,
    }),
  },
  {
    name: "scene order",
    build: () => ({
      type: "scene.reorder",
      orders: [
        { id: id(2), order: 99 },
        { id: id(3), order: 1 },
      ],
    }),
  },
  {
    name: "entry scene",
    build: () => ({ type: "scene.entry", sceneId: id(3) }),
  },
  {
    name: "layer create",
    build: (p) => ({
      type: "layer.create",
      sceneId: id(2),
      layer: { ...p.scenes[0].layers[0], id: id(50), order: 50 },
      objects: [],
      beforeLayerId: id(24),
    }),
  },
  {
    name: "layer settings",
    build: () => ({
      type: "layer.update",
      sceneId: id(2),
      layerId: id(24),
      changes: {
        name: "Renamed",
        type: "COLLISION",
        visible: false,
        locked: true,
      },
    }),
  },
  {
    name: "layer duplicate",
    build: () => ({
      type: "layer.duplicate",
      sceneId: id(2),
      layerId: id(24),
      newId: id(50),
      name: "Copy",
    }),
  },
  {
    name: "populated layer delete",
    build: () => ({
      type: "layer.delete",
      sceneId: id(2),
      layerId: id(24),
      confirmed: true,
    }),
  },
  {
    name: "layer order",
    build: () => ({
      type: "layer.reorder",
      sceneId: id(2),
      orders: [
        { id: id(24), order: 80 },
        { id: id(25), order: 2 },
      ],
    }),
  },
];

test.each(commands)(
  "$name persists exact data and restores stable IDs, physical order and settings on undo/redo",
  ({ build }) => {
    const before = project();
    const mutation = build(
      before,
    ) as ApplyMutationBatchInput["mutations"][number];
    const state = createStudioState(identity, {
      revision: 4,
      document: before,
    });
    const committed = studioReducer(state, {
      type: "commit",
      mutations: [mutation],
      ...metadata,
    });
    const expected = applyProjectMutations(before, [mutation]);
    expect(committed.document).toEqual(expected);
    expect(committed.document).not.toEqual(before);
    expect(committed.history.past).toHaveLength(1);
    const recovered = restoreRecovery(
      state,
      JSON.parse(JSON.stringify(recoveryEnvelope(committed))),
    );
    expect(recovered.document).toEqual(expected);
    const undone = studioReducer(committed, { type: "undo", ...metadata });
    expect(undone.document).toEqual(before);
    expect(applyProjectMutations(before, undone.pending!.mutations)).toEqual(
      before,
    );
    const redone = studioReducer(undone, { type: "redo", ...metadata });
    expect(redone.document).toEqual(expected);
    expect(applyProjectMutations(before, redone.pending!.mutations)).toEqual(
      expected,
    );
  },
);

test("mixed gestures compose inverses without dropping operations on the same scene", () => {
  const before = project();
  let state = createStudioState(identity, { revision: 4, document: before });
  for (const command of [commands[1], commands[8], commands[11]])
    state = studioReducer(state, {
      type: "commit",
      mutations: [
        command.build(before),
      ] as ApplyMutationBatchInput["mutations"],
      gestureId: "one-gesture",
      ...metadata,
    });
  expect(state.document.scenes[0].layers[0]).toMatchObject({
    name: "Renamed",
    order: 80,
    visible: false,
  });
  expect(state.history.past).toHaveLength(1);
  const undone = studioReducer(state, { type: "undo", ...metadata });
  expect(undone.document).toEqual(before);
  expect(studioReducer(undone, { type: "redo", ...metadata }).document).toEqual(
    state.document,
  );
});

test("history preserves atomic batches whose intermediate scene keys collide", () => {
  const before = project();
  const mutations: ApplyMutationBatchInput["mutations"] = [
    { type: "scene.update", sceneId: id(2), changes: { key: "scene-3" } },
    { type: "scene.update", sceneId: id(3), changes: { key: "scene-2" } },
  ];
  expect(
    applyProjectMutations(before, mutations).scenes.map((x) => x.key),
  ).toEqual(["scene-3", "scene-2"]);
  const state = studioReducer(
    createStudioState(identity, { revision: 4, document: before }),
    { type: "commit", mutations, ...metadata },
  );
  expect(state.document.scenes.map((x) => x.key)).toEqual([
    "scene-3",
    "scene-2",
  ]);
  expect(studioReducer(state, { type: "undo", ...metadata }).document).toEqual(
    before,
  );
});

test("autosave does not split a dependent edit at the 100-command boundary", () => {
  const before = project();
  let state = createStudioState(identity, { revision: 4, document: before });
  state = studioReducer(state, {
    type: "commit",
    mutations: Array.from({ length: 99 }, (_, n) => ({
      type: "scene.rename",
      sceneId: id(2),
      name: `Opening ${n}`,
    })),
    ...metadata,
  });
  state = studioReducer(state, {
    type: "commit",
    mutations: [
      { type: "scene.update", sceneId: id(2), changes: { key: "scene-3" } },
      { type: "scene.update", sceneId: id(3), changes: { key: "scene-2" } },
    ],
    ...metadata,
  });
  expect(state.pending!.mutations).toHaveLength(99);
  expect(state.queued).toHaveLength(2);
  const acknowledged = {
    revision: 5,
    document: applyProjectMutations(before, state.pending!.mutations),
  };
  const next = studioReducer(state, {
    type: "acknowledged",
    acknowledged,
    savedMutationId: state.pending!.mutationId,
    mutationId: "second",
    timestamp: 2,
  });
  expect(next.pending!.mutations).toHaveLength(2);
  expect(
    applyProjectMutations(acknowledged.document, next.pending!.mutations),
  ).toEqual(state.document);
});

test("an unsplittable recovered queue stays intact and unsynced after acknowledgement and retry", () => {
  const before = project();
  const queued: ApplyMutationBatchInput["mutations"] = [
    { type: "scene.update", sceneId: id(2), changes: { key: "scene-3" } },
    ...Array.from({ length: 99 }, (_, n) => ({
      type: "scene.rename" as const,
      sceneId: id(2),
      name: `Queued ${n}`,
    })),
    { type: "scene.update", sceneId: id(3), changes: { key: "scene-2" } },
  ];
  const initial = createStudioState(identity, {
    revision: 4,
    document: before,
  });
  expect(() =>
    studioReducer(initial, { type: "commit", mutations: queued, ...metadata }),
  ).toThrow();
  const pending = {
    baseRevision: 4,
    mutationId: "attempted",
    mutations: [
      { type: "scene.rename" as const, sceneId: id(3), name: "Saved" },
    ],
  };
  const envelope = { ...recoveryEnvelope(initial), pending, queued };
  const recovered = restoreRecovery(initial, envelope);
  const acknowledged = {
    revision: 5,
    document: applyProjectMutations(before, pending.mutations),
  };
  const next = studioReducer(recovered, {
    type: "acknowledged",
    acknowledged,
    savedMutationId: "attempted",
    mutationId: "next",
    timestamp: 2,
  });
  expect(next.status).toBe("UNSYNCED");
  expect(next.pending).toBeNull();
  expect(next.queued).toEqual(queued);
  expect(next.document).toEqual(recovered.document);
  const retried = studioReducer(next, { type: "retry", ...metadata });
  expect(retried.status).toBe("UNSYNCED");
  expect(retried.queued).toEqual(queued);
  const restored = restoreRecovery(
    createStudioState(identity, acknowledged),
    recoveryEnvelope(retried),
  );
  expect(restored.status).toBe("UNSYNCED");
  expect(restored.document).toEqual(next.document);
});

test("lost scene-create responses retain the attempted batch identity and duplicate IDs through retry and promotion", () => {
  const before = project();
  const initial = createStudioState(identity, {
    revision: 4,
    document: before,
  });
  let state = studioReducer(initial, {
    type: "commit",
    mutations: [
      commands[3].build(before),
    ] as ApplyMutationBatchInput["mutations"],
    mutationId: "original",
    timestamp: 1,
  });
  state = studioReducer(state, { type: "persisted", version: state.version });
  state = studioReducer(state, {
    type: "save-started",
    version: state.version,
  });
  const attempted = structuredClone(state.pending);
  state = studioReducer(state, {
    type: "commit",
    mutations: [
      { type: "scene.rename", sceneId: id(50), name: "Queued rename" },
    ],
    mutationId: "queued",
    timestamp: 2,
  });
  state = studioReducer(state, {
    type: "save-failed",
    savedMutationId: "original",
    conflict: false,
    currentRevision: null,
    timestamp: 3,
  });
  state = studioReducer(state, {
    type: "retry",
    mutationId: "retry",
    timestamp: 4,
  });
  expect(state.pending).toEqual(attempted);
  expect(state.queued).toEqual([
    { type: "scene.rename", sceneId: id(50), name: "Queued rename" },
  ]);
  const recovered = restoreRecovery(initial, recoveryEnvelope(state));
  const next = studioReducer(recovered, {
    type: "acknowledged",
    savedMutationId: "original",
    acknowledged: {
      revision: 5,
      document: applyProjectMutations(before, attempted!.mutations),
    },
    mutationId: "promoted",
    timestamp: 5,
  });
  expect(next.pending).toEqual({
    baseRevision: 5,
    mutationId: "promoted",
    mutations: state.queued,
  });
  expect(next.document).toEqual(state.document);
  expect(next.document.scenes[2].name).toBe("Queued rename");
});

afterEach(() => vi.restoreAllMocks());
async function shell(initial = project(), persist = false) {
  let studio!: ReturnType<typeof useStudio>;
  let saved = structuredClone(initial);
  let revision = 4;
  let envelope: unknown = null;
  const batches: ApplyMutationBatchInput[] = [];
  function Probe() {
    const value = useStudio();
    useEffect(() => {
      studio = value;
    });
    return null;
  }
  const props = {
    identity,
    initial: { document: initial, revision: 4 },
    debounceMs: persist ? 0 : 60_000,
    storage: {
      read: async () => structuredClone(envelope),
      write: async (value: unknown) => {
        envelope = structuredClone(value);
      },
    },
    transport: async (_game: string, batch: ApplyMutationBatchInput) => {
      expect(batch.baseRevision).toBe(revision);
      batches.push(structuredClone(batch));
      saved = applyProjectMutations(
        saved,
        JSON.parse(JSON.stringify(batch.mutations)),
      );
      revision += 1;
      return { document: saved, revision };
    },
  };
  const game = {
    id: "game",
    title: "Game",
    visibility: "DRAFT",
    reviewState: "DRAFT",
  } as GameSummary;
  const view = render(
    <StudioProvider {...props}>
      <StudioShell initialGame={game} />
      <Probe />
    </StudioProvider>,
  );
  await act(async () => {});
  return {
    get studio() {
      return studio;
    },
    get saved() {
      return saved;
    },
    batches,
    reload: async () => {
      view.unmount();
      render(
        <StudioProvider {...props} initial={{ document: saved, revision }}>
          <StudioShell initialGame={game} />
          <Probe />
        </StudioProvider>,
      );
      await act(async () => {});
    },
  };
}
const button = (name: string) => screen.getByRole("button", { name });

test("shell exposes scene creation, settings, rename, duplicate, order and entry controls through canonical history", async () => {
  const h = await shell();
  fireEvent.click(button("Thêm Scene"));
  expect(h.studio.state.document.scenes).toHaveLength(3);
  const created = h.studio.state.document.scenes[2];
  expect(created.id).not.toBe(id(2));
  fireEvent.change(screen.getByRole("textbox", { name: "Tên Scene" }), {
    target: { value: "Island" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Loại Scene" }), {
    target: { value: "MAP" },
  });
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Chiều rộng Scene" }),
    { target: { value: "1200" } },
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Trọng lực Y" }), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Bật lưới" }));
  fireEvent.click(button("Lưu Scene"));
  expect(h.studio.state.document.scenes[2]).toMatchObject({
    id: created.id,
    name: "Island",
    type: "MAP",
    width: 1200,
    settings: { gravityY: 250, grid: { enabled: true } },
  });
  fireEvent.click(button("Đặt làm Scene bắt đầu"));
  expect(h.studio.state.document.entrySceneId).toBe(created.id);
  fireEvent.click(button("Đưa Scene lên"));
  expect(
    [...h.studio.state.document.scenes]
      .sort((a, b) => a.order - b.order)
      .map((x) => x.name),
  ).toEqual(["Opening", "Island", "Ending"]);
  fireEvent.click(button("Nhân bản Scene"));
  expect(h.studio.state.document.scenes).toHaveLength(4);
  const copy = structuredClone(h.studio.state.document.scenes[3]);
  expect(copy.id).not.toBe(created.id);
  fireEvent.click(button("Hoàn tác"));
  expect(h.studio.state.document.scenes).toHaveLength(3);
  fireEvent.click(button("Làm lại"));
  expect(h.studio.state.document.scenes[3]).toEqual(copy);
});

test("scene deletion uses cancellable TFG confirmation, explicit entry replacement, and undo", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const h = await shell();
  const before = structuredClone(h.studio.state.document);
  button("Xóa Scene").focus();
  fireEvent.click(button("Xóa Scene"));
  let dialog = screen.getByRole("dialog", { name: "Xóa Scene" });
  expect(h.studio.state.document).toEqual(before);
  expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();
  expect(
    within(dialog).getByRole("button", { name: "Xác nhận xóa" }),
  ).toBeDisabled();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(button("Xóa Scene")).toHaveFocus();
  fireEvent.click(button("Xóa Scene"));
  dialog = screen.getByRole("dialog", { name: "Xóa Scene" });
  fireEvent.change(
    within(dialog).getByRole("combobox", { name: "Scene bắt đầu thay thế" }),
    { target: { value: id(3) } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận xóa" }));
  expect(h.studio.state.document.scenes).toHaveLength(1);
  expect(h.studio.state.document.entrySceneId).toBe(id(3));
  expect(button("Xóa Scene")).toBeDisabled();
  fireEvent.click(button("Hoàn tác"));
  expect(h.studio.state.document).toEqual(before);
  expect(alert).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

test("layer controls persist names, type, visibility, lock and order across autosave/reload", async () => {
  const h = await shell(project(), true);
  fireEvent.click(button("Thêm lớp"));
  expect(h.studio.state.document.scenes[0].layers).toHaveLength(3);
  const layerId = h.studio.state.document.scenes[0].layers[2].id;
  const row = screen.getByRole("group", { name: "Lớp mới" });
  fireEvent.change(within(row).getByRole("textbox", { name: "Tên lớp" }), {
    target: { value: "HUD" },
  });
  fireEvent.change(within(row).getByRole("combobox", { name: "Loại lớp" }), {
    target: { value: "UI" },
  });
  fireEvent.click(within(row).getByRole("checkbox", { name: "Hiện lớp" }));
  fireEvent.click(within(row).getByRole("checkbox", { name: "Khóa lớp" }));
  fireEvent.click(within(row).getByRole("button", { name: "Lưu lớp" }));
  const hud = screen.getByRole("group", { name: "HUD" });
  fireEvent.click(within(hud).getByRole("button", { name: "Đưa lớp lên" }));
  expect(
    h.studio.state.document.scenes[0].layers.find((x) => x.id === layerId),
  ).toMatchObject({
    name: "HUD",
    type: "UI",
    visible: false,
    locked: true,
    order: 20,
  });
  const expected = structuredClone(h.studio.state.document);
  await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
  expect(h.saved).toEqual(expected);
  expect(h.batches.length).toBeGreaterThan(0);
  await h.reload();
  expect(h.studio.state.document).toEqual(expected);
  expect(screen.getByRole("group", { name: "HUD" })).toBeVisible();
  fireEvent.click(
    within(screen.getByRole("group", { name: "World" })).getByRole("button", {
      name: "Nhân bản lớp",
    }),
  );
  expect(h.studio.state.document.scenes[0].objects).toHaveLength(5);
  fireEvent.click(
    within(screen.getByRole("group", { name: "World (bản sao)" })).getByRole(
      "button",
      { name: "Xóa lớp" },
    ),
  );
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Xóa lớp" })).getByRole(
      "button",
      { name: "Xác nhận xóa" },
    ),
  );
  expect(h.studio.state.document).toEqual(expected);
  fireEvent.click(button("Hoàn tác"));
  expect(h.studio.state.document.scenes[0].objects).toHaveLength(5);
});

test("referenced scene deletion reports a visible error and retains all canonical work", async () => {
  const input = project();
  input.events = [
    {
      id: id(500),
      version: 1,
      name: "Incoming",
      enabled: true,
      order: 0,
      trigger: { type: "ON_START" },
      condition: null,
      steps: [
        { id: id(501), version: 1, type: "CHANGE_SCENE", sceneId: id(2) },
      ],
    },
  ];
  const h = await shell(input);
  fireEvent.click(button("Xóa Scene"));
  const dialog = screen.getByRole("dialog", { name: "Xóa Scene" });
  fireEvent.change(
    within(dialog).getByRole("combobox", { name: "Scene bắt đầu thay thế" }),
    { target: { value: id(3) } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận xóa" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/tham chiếu/);
  expect(h.studio.state.document).toEqual(input);
  expect(h.studio.state.history.past).toHaveLength(0);
});
