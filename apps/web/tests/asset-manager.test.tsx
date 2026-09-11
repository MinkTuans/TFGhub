import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyProjectMutations,
  EngineProjectV2,
  type EngineProjectV2Type,
  type GameAssetSummary,
} from "@indieforge/contracts";
import {
  StudioProvider,
  useStudio,
} from "../components/studio/studio-provider";
import { SceneCanvas } from "../components/studio/canvas/scene-canvas";
import { recordingContext } from "./canvas-context";
import type { StudioMutation } from "../components/studio/studio-state";
import { createAssetDrop } from "../components/studio/asset-drop";
import { ApiError } from "../lib/api-client";

const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;

function project(assetIds: string[] = []): EngineProjectV2Type {
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds,
    scenes: [
      {
        id: id(2),
        key: "main",
        name: "Main",
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
          {
            id: id(4),
            name: "UI",
            type: "UI",
            order: 1,
            visible: true,
            locked: false,
          },
        ],
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

function asset(
  n: number,
  changes: Partial<GameAssetSummary> = {},
): GameAssetSummary {
  return {
    id: id(n),
    projectId: id(1),
    kind: "IMAGE",
    state: "READY",
    displayName: `Asset ${n}`,
    contentHash: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 128,
    width: 32,
    height: 24,
    durationMs: null,
    metadata: {
      category: "USER",
      image: { format: "png", orientation: 1, colorSpace: "srgb" },
      thumbnail: {
        recipe: "thumb-v1",
        contentHash: "b".repeat(64),
        width: 32,
        height: 24,
      },
    },
    contentUrl: `/games/game/assets/${id(n)}/content`,
    thumbnailUrl: `/games/game/assets/${id(n)}/thumbnail`,
    references: { revisions: 0, builds: 0 },
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
    tombstonedAt: null,
    ...changes,
  };
}

function withPlacedItem(item: GameAssetSummary) {
  const document = project([item.id]);
  document.scenes.push({
    id: id(20),
    key: "inventory",
    name: "Inventory",
    type: "MIXED",
    order: 1,
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
        id: id(21),
        name: "World",
        type: "WORLD",
        order: 0,
        visible: true,
        locked: false,
      },
    ],
    objects: [],
  });
  const ids = [id(100), id(101), id(102), id(103)];
  const placement = createAssetDrop({
    document,
    sceneId: id(20),
    layerId: id(21),
    parentId: null,
    payload: JSON.stringify({ assetId: item.id, kind: "IMAGE", role: "ITEM" }),
    metadata: [item],
    client: { x: 100, y: 100 },
    rect: { left: 0, top: 0, width: 640, height: 480 },
    camera: { x: 0, y: 0, zoom: 1, viewportWidth: 640, viewportHeight: 480 },
    newId: () => ids.shift()!,
  });
  return applyProjectMutations(document, placement.mutations);
}

type AssetClient = {
  list: (
    gameId: string,
    query: Record<string, string | number>,
  ) => Promise<{
    items: GameAssetSummary[];
    total: number;
    offset: number;
    limit: number;
  }>;
  get: (
    gameId: string,
    assetId: string,
    signal?: AbortSignal,
  ) => Promise<GameAssetSummary>;
  upload: (
    gameId: string,
    input: {
      uploadId: string;
      file: File;
      category: string;
      displayName?: string;
    },
    onProgress: (percentage: number) => void,
  ) => Promise<GameAssetSummary>;
  update: (
    gameId: string,
    assetId: string,
    changes: { displayName?: string; category?: string },
  ) => Promise<GameAssetSummary>;
  tombstone: (gameId: string, assetId: string) => Promise<GameAssetSummary>;
};

type AssetManagerProps = {
  client?: AssetClient;
  onAssetsChange?: (assets: GameAssetSummary[]) => void;
  onPlaceAsset?: (payload: string) => void;
};
type AssetModule = {
  AssetManager: ComponentType<AssetManagerProps>;
};
const modules = import.meta.glob(
  "../components/studio/assets/asset-manager.tsx",
);
async function assetModule(): Promise<AssetModule> {
  const path = "../components/studio/assets/asset-manager.tsx";
  expect(modules, "Asset Manager UI is not implemented").toHaveProperty(path);
  return (await modules[path]!()) as AssetModule;
}

function clientFor(getItems: () => GameAssetSummary[]): AssetClient {
  return {
    list: vi.fn(async (_gameId, query) => {
      const search = String(query.search ?? "").toLowerCase();
      const items = getItems().filter(
        (item) =>
          item.state === (query.state ?? "READY") &&
          (!query.category || item.metadata.category === query.category) &&
          (!query.kind || item.kind === query.kind) &&
          (!search || item.displayName.toLowerCase().includes(search)),
      );
      return { items, total: items.length, offset: 0, limit: 30 };
    }),
    get: vi.fn(async (_gameId, assetId) => {
      const found = getItems().find((item) => item.id === assetId);
      if (!found) throw new Error("not found");
      return found;
    }),
    upload: vi.fn(async () => {
      throw new Error("upload not configured");
    }),
    update: vi.fn(async (_gameId, assetId, changes) => {
      const found = getItems().find((item) => item.id === assetId)!;
      Object.assign(found, changes);
      return structuredClone(found);
    }),
    tombstone: vi.fn(async (_gameId, assetId) => {
      const found = getItems().find((item) => item.id === assetId)!;
      found.state = "TOMBSTONED";
      found.tombstonedAt = "2026-09-11T01:00:00.000Z";
      return structuredClone(found);
    }),
  };
}

function Wrapper({
  children,
  document = project(),
}: {
  children: React.ReactNode;
  document?: EngineProjectV2Type;
}) {
  return (
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document, revision: 0 }}
      storage={{ read: async () => null, write: async () => {} }}
    >
      {children}
    </StudioProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    recordingContext().context,
  );
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({
    left: 10,
    top: 20,
    width: 640,
    height: 480,
    right: 650,
    bottom: 500,
    x: 10,
    y: 20,
    toJSON() {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("a missing category/search implementation cannot hide API-backed groups or eagerly load image previews", async () => {
  const { AssetManager } = await assetModule();
  const items = [
    asset(900, {
      displayName: "Forest tiles",
      metadata: {
        ...asset(900).metadata,
        category: "MAP_TILESET",
      },
    }),
    asset(901, {
      displayName: "Hero",
      metadata: { ...asset(901).metadata, category: "CHARACTER" },
    }),
  ];
  const client = clientFor(() => items);
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );

  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  for (const name of [
    "All",
    "Map-Tileset",
    "Character",
    "NPC",
    "Item",
    "UI",
    "Audio",
    "Effect",
    "Image",
    "User",
  ])
    expect(within(manager).getByRole("button", { name })).toBeVisible();
  await within(manager).findByText("Forest tiles");
  const preview = within(manager).getByRole("img", {
    name: "Xem trước Forest tiles",
  });
  expect(preview).toHaveAttribute("loading", "lazy");
  expect(preview.getAttribute("src")).toContain(items[0]!.thumbnailUrl);

  fireEvent.click(within(manager).getByRole("button", { name: "Character" }));
  await waitFor(() =>
    expect(within(manager).queryByText("Forest tiles")).not.toBeInTheDocument(),
  );
  expect(within(manager).getByText("Hero")).toBeVisible();
  fireEvent.change(
    within(manager).getByRole("searchbox", { name: "Tìm asset" }),
    {
      target: { value: "missing" },
    },
  );
  await within(manager).findByText("Không tìm thấy tài nguyên.");
  fireEvent.change(
    within(manager).getByRole("combobox", { name: "Loại file" }),
    {
      target: { value: "IMAGE" },
    },
  );
  await waitFor(() =>
    expect(client.list).toHaveBeenLastCalledWith(
      "game",
      expect.objectContaining({
        search: "missing",
        category: "CHARACTER",
        kind: "IMAGE",
      }),
    ),
  );
});

test("audio previews never preload binary content while browsing the library", async () => {
  const { AssetManager } = await assetModule();
  const audio = asset(899, {
    kind: "AUDIO",
    displayName: "Quiet theme",
    mimeType: "audio/wav",
    width: null,
    height: null,
    durationMs: 800,
    metadata: {
      category: "AUDIO",
      audio: { channels: 1, sampleRate: 8000, bitsPerSample: 16 },
    },
    thumbnailUrl: null,
  });
  render(
    <Wrapper>
      <AssetManager client={clientFor(() => [audio])} />
    </Wrapper>,
  );

  expect(
    await screen.findByRole("group", { name: "Asset Quiet theme" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Nghe thử Quiet theme")).toHaveAttribute(
    "preload",
    "none",
  );
});

test("a missing upload retry implementation loses visible progress or changes the idempotent upload identity", async () => {
  const { AssetManager } = await assetModule();
  const items: GameAssetSummary[] = [];
  const client = clientFor(() => items);
  const attempts: Array<{ uploadId: string; file: File }> = [];
  let fail = true;
  client.upload = vi.fn(async (_gameId, input, progress) => {
    attempts.push({ uploadId: input.uploadId, file: input.file });
    progress(45);
    if (fail) {
      fail = false;
      throw new Error("network interrupted");
    }
    const uploaded = asset(902, {
      id: input.uploadId,
      displayName: input.file.name,
    });
    items.push(uploaded);
    progress(100);
    return uploaded;
  });
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const file = new File(["png"], "hero.png", { type: "image/png" });
  fireEvent.change(within(manager).getByLabelText("Tải asset lên"), {
    target: { files: [file] },
  });
  await within(manager).findByText("45%");
  await within(manager).findByRole("alert", { name: "Lỗi tải hero.png" });
  fireEvent.click(
    within(manager).getByRole("button", { name: "Thử lại hero.png" }),
  );
  await within(manager).findByText("hero.png");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test("a missing rename/delete implementation cannot warn on current and retained dependencies before tombstoning", async () => {
  const { AssetManager } = await assetModule();
  const used = asset(900, {
    displayName: "Used hero",
    references: { revisions: 2, builds: 1 },
  });
  const unused = asset(901, {
    displayName: "Old prop",
    references: { revisions: 3, builds: 0 },
  });
  const items = [used, unused];
  const client = clientFor(() => items);
  render(
    <Wrapper document={withPlacedItem(used)}>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const usedCard = await within(manager).findByRole("group", {
    name: "Asset Used hero",
  });
  fireEvent.click(within(usedCard).getByRole("button", { name: "Đổi tên" }));
  fireEvent.change(
    within(usedCard).getByRole("textbox", { name: "Tên asset" }),
    {
      target: { value: "Hero final" },
    },
  );
  fireEvent.click(within(usedCard).getByRole("button", { name: "Lưu tên" }));
  await within(manager).findByText("Hero final");

  fireEvent.click(within(usedCard).getByRole("button", { name: "Xóa asset" }));
  const blocked = await screen.findByRole("dialog", {
    name: "Xóa Hero final?",
  });
  expect(
    within(blocked).getByText(/đang được dùng trong dự án hiện tại/i),
  ).toBeVisible();
  expect(
    within(blocked).getByRole("button", { name: "Xác nhận xóa" }),
  ).toBeDisabled();
  fireEvent.click(within(blocked).getByRole("button", { name: "Hủy" }));

  const unusedCard = within(manager).getByRole("group", {
    name: "Asset Old prop",
  });
  fireEvent.click(
    within(unusedCard).getByRole("button", { name: "Xóa asset" }),
  );
  const allowed = await screen.findByRole("dialog", { name: "Xóa Old prop?" });
  expect(within(allowed).getByText(/3 phiên bản đã lưu/i)).toBeVisible();
  fireEvent.click(
    within(allowed).getByRole("button", { name: "Xác nhận xóa" }),
  );
  await waitFor(() =>
    expect(within(manager).queryByText("Old prop")).not.toBeInTheDocument(),
  );
});

test("a declaration without semantic dependencies must save asset.forget before tombstone and retain historical warnings", async () => {
  const { AssetManager } = await assetModule();
  const unused = asset(904, {
    displayName: "Former prop",
    references: { revisions: 4, builds: 2 },
  });
  const items = [unused];
  const client = clientFor(() => items);
  let server = project([unused.id]);
  let revision = 7;
  const transport = vi.fn(
    async (_gameId: string, batch: { mutations: StudioMutation[] }) => {
      server = applyProjectMutations(server, batch.mutations);
      revision += 1;
      return { document: server, revision };
    },
  );
  client.tombstone = vi.fn(async (_gameId, assetId) => {
    expect(server.assetIds).not.toContain(assetId);
    const found = items[0]!;
    found.state = "TOMBSTONED";
    found.tombstonedAt = "2026-09-11T01:00:00.000Z";
    return structuredClone(found);
  });
  render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: server, revision }}
      storage={{ read: async () => null, write: async () => {} }}
      transport={transport}
      debounceMs={0}
    >
      <AssetManager client={client} />
    </StudioProvider>,
  );

  const card = await screen.findByRole("group", { name: "Asset Former prop" });
  fireEvent.click(within(card).getByRole("button", { name: "Xóa asset" }));
  const confirmation = await screen.findByRole("dialog", {
    name: "Xóa Former prop?",
  });
  expect(within(confirmation).getByText(/4 phiên bản đã lưu/i)).toBeVisible();
  expect(within(confirmation).getByText(/2 bản build/i)).toBeVisible();
  const confirm = within(confirmation).getByRole("button", {
    name: "Xác nhận xóa",
  });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);

  await waitFor(() => expect(client.tombstone).toHaveBeenCalledTimes(1));
  expect(transport).toHaveBeenCalledTimes(1);
  expect(server.assetIds).toEqual([]);
  await waitFor(() => expect(card).not.toBeInTheDocument());
});

test("a failed canonical declaration release must never call the tombstone API", async () => {
  const { AssetManager } = await assetModule();
  const unused = asset(905, { displayName: "Recoverable prop" });
  const client = clientFor(() => [unused]);
  client.tombstone = vi.fn(async () => unused);
  const transport = vi.fn(async () => {
    throw new Error("save unavailable");
  });
  render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: project([unused.id]), revision: 3 }}
      storage={{ read: async () => null, write: async () => {} }}
      transport={transport}
      debounceMs={0}
    >
      <AssetManager client={client} />
    </StudioProvider>,
  );

  const card = await screen.findByRole("group", {
    name: "Asset Recoverable prop",
  });
  fireEvent.click(within(card).getByRole("button", { name: "Xóa asset" }));
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Xóa Recoverable prop?" })).getByRole(
      "button",
      { name: "Xác nhận xóa" },
    ),
  );

  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  expect(client.tombstone).not.toHaveBeenCalled();
  expect(card).toBeInTheDocument();
});

test("a list captured before DELETE cannot resurrect a tombstoned READY card", async () => {
  const { AssetManager } = await assetModule();
  const doomed = asset(906, { displayName: "Doomed prop" });
  let release!: (value: {
    items: GameAssetSummary[];
    total: number;
    offset: number;
    limit: number;
  }) => void;
  let calls = 0;
  const client = clientFor(() => [doomed]);
  client.list = vi.fn(async () => {
    calls += 1;
    if (calls === 1)
      return { items: [structuredClone(doomed)], total: 1, offset: 0, limit: 30 };
    if (calls === 2)
      return new Promise<{
        items: GameAssetSummary[];
        total: number;
        offset: number;
        limit: number;
      }>((resolve) => {
        release = resolve;
      });
    const ready = doomed.state === "READY" ? [structuredClone(doomed)] : [];
    return { items: ready, total: ready.length, offset: 0, limit: 30 };
  });
  client.tombstone = vi.fn(async () => {
    doomed.state = "TOMBSTONED";
    doomed.tombstonedAt = "2026-09-11T01:00:00.000Z";
    return structuredClone(doomed);
  });
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const card = await within(manager).findByRole("group", {
    name: "Asset Doomed prop",
  });
  fireEvent.change(within(manager).getByRole("searchbox", { name: "Tìm asset" }), {
    target: { value: "Doomed" },
  });
  await waitFor(() => expect(calls).toBe(2));
  fireEvent.click(within(card).getByRole("button", { name: "Xóa asset" }));
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Xóa Doomed prop?" })).getByRole(
      "button",
      { name: "Xác nhận xóa" },
    ),
  );
  await waitFor(() => expect(card).not.toBeInTheDocument());

  await act(async () => {
    release({
      items: [asset(906, { displayName: "Doomed prop" })],
      total: 1,
      offset: 0,
      limit: 30,
    });
  });
  expect(
    within(manager).queryByRole("group", { name: "Asset Doomed prop" }),
  ).not.toBeInTheDocument();
});

test("a rename out of search cannot be overwritten by a list captured before PATCH", async () => {
  const { AssetManager } = await assetModule();
  const hero = asset(907, { displayName: "Hero old" });
  let release!: (value: {
    items: GameAssetSummary[];
    total: number;
    offset: number;
    limit: number;
  }) => void;
  let calls = 0;
  const client = clientFor(() => [hero]);
  client.list = vi.fn(async (_gameId, query) => {
    calls += 1;
    if (calls === 1)
      return { items: [structuredClone(hero)], total: 1, offset: 0, limit: 30 };
    if (calls === 2)
      return new Promise<{
        items: GameAssetSummary[];
        total: number;
        offset: number;
        limit: number;
      }>((resolve) => {
        release = resolve;
      });
    const matches = hero.displayName
      .toLowerCase()
      .includes(String(query.search).toLowerCase())
      ? [structuredClone(hero)]
      : [];
    return { items: matches, total: matches.length, offset: 0, limit: 30 };
  });
  client.update = vi.fn(async () => {
    hero.displayName = "Villain";
    return structuredClone(hero);
  });
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const card = await within(manager).findByRole("group", { name: "Asset Hero old" });
  fireEvent.change(within(manager).getByRole("searchbox", { name: "Tìm asset" }), {
    target: { value: "Hero" },
  });
  await waitFor(() => expect(calls).toBe(2));
  fireEvent.click(within(card).getByRole("button", { name: "Đổi tên" }));
  fireEvent.change(within(card).getByRole("textbox", { name: "Tên asset" }), {
    target: { value: "Villain" },
  });
  fireEvent.click(within(card).getByRole("button", { name: "Lưu tên" }));

  await waitFor(() => expect(card).not.toBeInTheDocument());
  release({
    items: [asset(907, { displayName: "Hero old" })],
    total: 1,
    offset: 0,
    limit: 30,
  });
  await Promise.resolve();
  expect(within(manager).queryByText("Hero old")).not.toBeInTheDocument();
  expect(within(manager).queryByText("Villain")).not.toBeInTheDocument();
});

test("a delayed PATCH cannot replace a newer completed search with its captured view", async () => {
  const { AssetManager } = await assetModule();
  const hero = asset(908, { displayName: "Hero pending" });
  const client = clientFor(() => [hero]);
  const queries: Array<Record<string, string | number>> = [];
  client.list = vi.fn(async (_gameId, query) => {
    queries.push({ ...query });
    const search = String(query.search ?? "").toLowerCase();
    const items = hero.displayName.toLowerCase().includes(search)
      ? [structuredClone(hero)]
      : [];
    return { items, total: items.length, offset: 0, limit: 30 };
  });
  let finishPatch!: () => void;
  client.update = vi.fn(
    (_gameId, _assetId, changes) =>
      new Promise<GameAssetSummary>((resolve) => {
        finishPatch = () => {
          hero.displayName = changes.displayName!;
          resolve(structuredClone(hero));
        };
      }),
  );
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const card = await within(manager).findByRole("group", {
    name: "Asset Hero pending",
  });
  fireEvent.click(within(card).getByRole("button", { name: "Đổi tên" }));
  fireEvent.change(within(card).getByRole("textbox", { name: "Tên asset" }), {
    target: { value: "Villain complete" },
  });
  fireEvent.click(within(card).getByRole("button", { name: "Lưu tên" }));
  await waitFor(() => expect(client.update).toHaveBeenCalledTimes(1));

  fireEvent.change(within(manager).getByRole("searchbox", { name: "Tìm asset" }), {
    target: { value: "Hero" },
  });
  await waitFor(() =>
    expect(queries.some((query) => query.search === "Hero")).toBe(true),
  );
  expect(card).toBeVisible();

  await act(async () => finishPatch());
  await waitFor(() =>
    expect(
      within(manager).queryByRole("group", { name: "Asset Villain complete" }),
    ).not.toBeInTheDocument(),
  );
  expect(within(manager).queryByText("Hero pending")).not.toBeInTheDocument();
  expect(queries.at(-1)?.search).toBe("Hero");
});

test("a delayed DELETE cannot discard the newer filter and loaded-page snapshot", async () => {
  const { AssetManager } = await assetModule();
  const doomed = asset(1100, { displayName: "Delete pending" });
  const survivor = asset(1101, { displayName: "User survivor" });
  const itemAssets = Array.from({ length: 61 }, (_, index) =>
    asset(1200 + index, {
      displayName: `Current item ${String(index).padStart(2, "0")}`,
      metadata: { ...asset(1200 + index).metadata, category: "ITEM" },
    }),
  );
  const items = [doomed, survivor, ...itemAssets];
  const client = clientFor(() => items);
  client.list = vi.fn(async (_gameId, query) => {
    const filtered = items.filter(
      (item) =>
        item.state === "READY" &&
        (!query.category || item.metadata.category === query.category),
    );
    const offset = Number(query.offset);
    const limit = Number(query.limit);
    return {
      items: structuredClone(filtered.slice(offset, offset + limit)),
      total: filtered.length,
      offset,
      limit,
    };
  });
  let finishDelete!: () => void;
  client.tombstone = vi.fn(
    () =>
      new Promise<GameAssetSummary>((resolve) => {
        finishDelete = () => {
          doomed.state = "TOMBSTONED";
          doomed.tombstonedAt = "2026-09-11T02:00:00.000Z";
          resolve(structuredClone(doomed));
        };
      }),
  );
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  const card = await within(manager).findByRole("group", {
    name: "Asset Delete pending",
  });
  fireEvent.click(within(card).getByRole("button", { name: "Xóa asset" }));
  fireEvent.click(
    within(
      await screen.findByRole("dialog", { name: "Xóa Delete pending?" }),
    ).getByRole("button", { name: "Xác nhận xóa" }),
  );
  await waitFor(() => expect(client.tombstone).toHaveBeenCalledTimes(1));

  fireEvent.click(within(manager).getByRole("button", { name: "Item" }));
  await within(manager).findByText("Current item 29");
  fireEvent.click(within(manager).getByRole("button", { name: "Tải thêm" }));
  await within(manager).findByText("Current item 59");

  await act(async () => finishDelete());
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Xóa Delete pending?" }),
    ).not.toBeInTheDocument(),
  );
  expect(within(manager).queryByText("User survivor")).not.toBeInTheDocument();
  expect(within(manager).getByText("Current item 59")).toBeVisible();
  expect(
    within(manager).getAllByRole("group", { name: /^Asset Current item/ }),
  ).toHaveLength(60);
});

test("a successful mutation must rebuild loaded page boundaries and totals", async () => {
  const { AssetManager } = await assetModule();
  const items = Array.from({ length: 31 }, (_, index) =>
    asset(1000 + index, { displayName: `Paged ${index}` }),
  );
  const client = clientFor(() => items);
  client.list = vi.fn(async (_gameId, query) => {
    const ready = items.filter((item) => item.state === "READY");
    const offset = Number(query.offset);
    const limit = Number(query.limit);
    return {
      items: structuredClone(ready.slice(offset, offset + limit)),
      total: ready.length,
      offset,
      limit,
    };
  });
  client.tombstone = vi.fn(async (_gameId, assetId) => {
    const found = items.find((item) => item.id === assetId)!;
    found.state = "TOMBSTONED";
    found.tombstonedAt = "2026-09-11T01:00:00.000Z";
    return structuredClone(found);
  });
  render(
    <Wrapper>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const manager = await screen.findByRole("region", { name: "Tài nguyên" });
  await within(manager).findByText("Paged 29");
  fireEvent.click(within(manager).getByRole("button", { name: "Tải thêm" }));
  const first = await within(manager).findByRole("group", { name: "Asset Paged 0" });
  await within(manager).findByText("Paged 30");
  fireEvent.click(within(first).getByRole("button", { name: "Xóa asset" }));
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Xóa Paged 0?" })).getByRole(
      "button",
      { name: "Xác nhận xóa" },
    ),
  );

  await waitFor(() => expect(first).not.toBeInTheDocument());
  expect(within(manager).queryByRole("button", { name: "Tải thêm" })).not.toBeInTheDocument();
  expect(within(manager).getAllByRole("group", { name: /^Asset Paged/ })).toHaveLength(30);
});

test("unrelated canonical edits cannot refetch cached references while a real ID change resolves only the new ID", async () => {
  const { AssetManager } = await assetModule();
  const first = asset(910, { displayName: "Cached first" });
  const second = asset(911, { displayName: "New second" });
  const client = clientFor(() => []);
  const reads = new Map<string, number>();
  client.get = vi.fn(async (_gameId, assetId) => {
    reads.set(assetId, (reads.get(assetId) ?? 0) + 1);
    return assetId === first.id ? first : second;
  });
  function Controls() {
    const { state, dispatch } = useStudio();
    return (
      <>
        <output aria-label="Tên Scene hiện tại">{state.document.scenes[0]!.name}</output>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "commit",
              mutations: [{ type: "scene.rename", sceneId: id(2), name: "Renamed" }],
            })
          }
        >
          Đổi Scene
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "commit",
              mutations: [{ type: "asset.declare", assetId: second.id }],
            })
          }
        >
          Khai báo asset mới
        </button>
      </>
    );
  }
  function Harness() {
    const [metadata, setMetadata] = useState<GameAssetSummary[]>([]);
    return (
      <>
        <Controls />
        <output aria-label="Resolved asset metadata">
          {metadata.map((item) => item.displayName).join(",")}
        </output>
        <AssetManager client={client} onAssetsChange={setMetadata} />
      </>
    );
  }
  render(
    <Wrapper document={project([first.id])}>
      <Harness />
    </Wrapper>,
  );

  await waitFor(() =>
    expect(screen.getByLabelText("Resolved asset metadata")).toHaveTextContent(
      "Cached first",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Đổi Scene" }));
  await screen.findByText("Renamed");
  await act(async () => {});
  expect(reads.get(first.id)).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Khai báo asset mới" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Resolved asset metadata")).toHaveTextContent(
      "New second",
    ),
  );
  expect(reads.get(first.id)).toBe(1);
  expect(reads.get(second.id)).toBe(1);
});

test("referenced metadata resolution must deduplicate, bound concurrency, abort old projects and ignore stale results", async () => {
  const { AssetManager } = await assetModule();
  const firstProjectIds = Array.from({ length: 10 }, (_, index) => id(920 + index));
  let active = 0;
  let maximum = 0;
  const pending = new Map<
    string,
    { signal?: AbortSignal; resolve: (value: GameAssetSummary) => void }
  >();
  const client = clientFor(() => []);
  client.get = vi.fn((_gameId, assetId, signal) => {
    active += 1;
    maximum = Math.max(maximum, active);
    return new Promise<GameAssetSummary>((resolve, reject) => {
      pending.set(assetId, {
        signal,
        resolve: (value) => {
          active -= 1;
          resolve(value);
        },
      });
      signal?.addEventListener("abort", () => {
        active -= 1;
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  });
  const view = render(
    <Wrapper document={project(firstProjectIds)}>
      <AssetManager client={client} />
    </Wrapper>,
  );
  await waitFor(() => expect(pending.size).toBeGreaterThan(0));
  expect(maximum).toBeLessThanOrEqual(4);
  const started = [...pending.values()];

  const nextDocument = project([id(950)]);
  nextDocument.projectId = id(951);
  nextDocument.scenes[0]!.id = id(952);
  nextDocument.scenes[0]!.key = "next";
  nextDocument.scenes[0]!.layers[0]!.id = id(953);
  nextDocument.entrySceneId = id(952);
  view.rerender(
    <StudioProvider
      identity={{ userId: "owner", gameId: "next-game", projectId: id(951) }}
      initial={{ document: nextDocument, revision: 0 }}
      storage={{ read: async () => null, write: async () => {} }}
    >
      <AssetManager client={client} />
    </StudioProvider>,
  );
  await waitFor(() => expect(started.every((entry) => entry.signal?.aborted)).toBe(true));
  expect(screen.queryByText(/Asset 92/)).not.toBeInTheDocument();
});

test("StrictMode replay must restart every still-required aborted reference read", async () => {
  const { AssetManager } = await assetModule();
  const referenced = asset(955, { displayName: "Strict resolved" });
  const client = clientFor(() => []);
  let reads = 0;
  let aborted = 0;
  client.get = vi.fn((_gameId, _assetId, signal) => {
    reads += 1;
    if (reads > 1) return Promise.resolve(referenced);
    return new Promise<GameAssetSummary>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        aborted += 1;
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  });
  function Metadata() {
    const [resolved, setResolved] = useState<GameAssetSummary[]>([]);
    return (
      <>
        <output aria-label="Strict metadata">
          {resolved.map((item) => item.displayName).join(",")}
        </output>
        <AssetManager client={client} onAssetsChange={setResolved} />
      </>
    );
  }
  render(
    <StrictMode>
      <Wrapper document={project([referenced.id])}>
        <Metadata />
      </Wrapper>
    </StrictMode>,
  );

  await waitFor(() =>
    expect(screen.getByLabelText("Strict metadata")).toHaveTextContent(
      "Strict resolved",
    ),
  );
  expect(reads).toBe(2);
  expect(aborted).toBe(1);
});

test("forget then redeclare must evict completed metadata and fetch the authoritative record", async () => {
  const { AssetManager } = await assetModule();
  const old = asset(956, { displayName: "Old cached name" });
  const current = asset(956, { displayName: "New authoritative name" });
  const client = clientFor(() => []);
  let reads = 0;
  client.get = vi.fn(async () => {
    reads += 1;
    return reads === 1 ? old : current;
  });
  function Controls() {
    const { dispatch } = useStudio();
    return (
      <>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "commit",
              mutations: [{ type: "asset.forget", assetId: old.id }],
            })
          }
        >
          Quên asset
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "commit",
              mutations: [{ type: "asset.declare", assetId: old.id }],
            })
          }
        >
          Khai báo lại
        </button>
      </>
    );
  }
  function Workspace() {
    const [metadata, setMetadata] = useState<GameAssetSummary[]>([]);
    return (
      <>
        <Controls />
        <output aria-label="Redeclared metadata">
          {metadata.map((item) => item.displayName).join(",")}
        </output>
        <AssetManager client={client} onAssetsChange={setMetadata} />
      </>
    );
  }
  render(
    <Wrapper document={project([old.id])}>
      <Workspace />
    </Wrapper>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Redeclared metadata")).toHaveTextContent(
      "Old cached name",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Quên asset" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Redeclared metadata")).toBeEmptyDOMElement(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Khai báo lại" }));

  await waitFor(() =>
    expect(screen.getByLabelText("Redeclared metadata")).toHaveTextContent(
      "New authoritative name",
    ),
  );
  expect(reads).toBe(2);
});

test("a transient referenced-asset read failure must stay visible and retry into a confirmed unavailable record", async () => {
  const { AssetManager } = await assetModule();
  const missing = asset(960, {
    displayName: "Deleted after retry",
    state: "TOMBSTONED",
    tombstonedAt: "2026-09-11T01:00:00.000Z",
  });
  const client = clientFor(() => []);
  let fail = true;
  client.get = vi.fn(async () => {
    if (fail) {
      fail = false;
      throw new ApiError(503, "temporarily unavailable");
    }
    return missing;
  });
  function CanonicalReference() {
    const { state } = useStudio();
    return <output aria-label="Canonical refs">{state.document.assetIds.join(",")}</output>;
  }
  render(
    <Wrapper document={project([missing.id])}>
      <CanonicalReference />
      <AssetManager client={client} />
    </Wrapper>,
  );

  const unresolved = await screen.findByRole("group", {
    name: `Asset reference ${missing.id}`,
  });
  expect(within(unresolved).getByText(/temporarily unavailable/i)).toBeVisible();
  expect(unresolved).toHaveAttribute("draggable", "false");
  expect(screen.getByLabelText("Canonical refs")).toHaveTextContent(missing.id);
  fireEvent.click(
    within(unresolved).getByRole("button", { name: `Thử lại asset ${missing.id}` }),
  );
  const resolved = await screen.findByRole("group", {
    name: "Asset Deleted after retry",
  });
  expect(resolved).toHaveAttribute("draggable", "false");
  expect(within(resolved).getByText("Đã xóa")).toBeVisible();
});

test.each([
  [404, "Không tìm thấy asset được tham chiếu"],
  [403, "Không có quyền đọc asset được tham chiếu"],
])(
  "a referenced metadata HTTP %s must remain an explicit non-draggable canonical diagnostic",
  async (status, message) => {
    const { AssetManager } = await assetModule();
    const assetId = id(970 + status);
    const client = clientFor(() => []);
    client.get = vi.fn(async () => {
      throw new ApiError(status, "request failed");
    });
    render(
      <Wrapper document={project([assetId])}>
        <AssetManager client={client} />
      </Wrapper>,
    );

    const unresolved = await screen.findByRole("group", {
      name: `Asset reference ${assetId}`,
    });
    expect(within(unresolved).getByText(message)).toBeVisible();
    expect(unresolved).toHaveAttribute("draggable", "false");
  },
);

test("a READY-only reload cannot hide a tombstoned asset that remains canonically declared", async () => {
  const { AssetManager } = await assetModule();
  const missing = asset(903, {
    displayName: "Deleted backdrop",
    state: "TOMBSTONED",
    tombstonedAt: "2026-09-11T01:00:00.000Z",
    references: { revisions: 1, builds: 0 },
  });
  const client = clientFor(() => [missing]);
  render(
    <Wrapper document={project([missing.id])}>
      <AssetManager client={client} />
    </Wrapper>,
  );
  const card = await screen.findByRole("group", {
    name: "Asset Deleted backdrop",
  });
  expect(card).toHaveAttribute("draggable", "false");
  expect(within(card).getByText("Đã xóa")).toBeVisible();
  expect(within(card).getByText("Đã khai báo trong dự án")).toBeVisible();
});

test("a missing real drag integration cannot atomically declare, save and reload an asset-id-only object", async () => {
  const { AssetManager } = await assetModule();
  const ready = asset(900, {
    displayName: "Potion",
    metadata: { ...asset(900).metadata, category: "ITEM" },
  });
  const client = clientFor(() => [ready]);
  let server = project();
  let revision = 0;
  let studio!: ReturnType<typeof useStudio>;
  const transport = vi.fn(
    async (_gameId: string, batch: { mutations: StudioMutation[] }) => {
      server = applyProjectMutations(server, batch.mutations);
      revision += 1;
      return { document: server, revision };
    },
  );
  function Observe() {
    const current = useStudio();
    useEffect(() => {
      studio = current;
    });
    return null;
  }
  function Workspace() {
    const [assets, setAssets] = useState<GameAssetSummary[]>([]);
    const metadata = useMemo(
      () =>
        assets.map((item) => ({
          id: item.id,
          projectId: item.projectId,
          state: item.state,
          kind: item.kind,
          displayName: item.displayName,
          width: item.width,
          height: item.height,
        })),
      [assets],
    );
    return (
      <>
        <Observe />
        <AssetManager client={client} onAssetsChange={setAssets} />
        <SceneCanvas
          scene={studio?.state.document.scenes[0] ?? server.scenes[0]!}
          assetMetadata={metadata}
        />
      </>
    );
  }
  const view = render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: server, revision }}
      storage={{ read: async () => null, write: async () => {} }}
      transport={transport}
      debounceMs={0}
    >
      <Workspace />
    </StudioProvider>,
  );
  const card = await screen.findByRole("group", { name: "Asset Potion" });
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    types: [] as string[],
    setData(type: string, value: string) {
      values.set(type, value);
      this.types = [...values.keys()];
    },
    getData(type: string) {
      return values.get(type) ?? "";
    },
  };
  fireEvent.dragStart(card, { dataTransfer });
  expect(JSON.parse(values.get("application/x-tfg-asset")!)).toEqual({
    assetId: ready.id,
    kind: "IMAGE",
    role: "ITEM",
  });
  const drop = new MouseEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: 110,
    clientY: 120,
  });
  Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
  fireEvent(screen.getByRole("img", { name: "Scene: Main" }), drop);
  await waitFor(() =>
    expect(studio.state.document.assetIds).toEqual([ready.id]),
  );
  await waitFor(() => expect(studio.state.status).toBe("SAVED"));
  expect(server.assetIds).toEqual([ready.id]);
  const savedObject = server.scenes[0]!.objects[0]!;
  expect(savedObject.components).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "InventoryItem",
        properties: expect.objectContaining({ iconAssetId: ready.id }),
      }),
    ]),
  );
  expect(JSON.stringify(savedObject)).not.toMatch(
    /contentUrl|thumbnailUrl|contentHash|mimeType/,
  );

  view.unmount();
  render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: server, revision }}
      storage={{ read: async () => null, write: async () => {} }}
    >
      <AssetManager client={client} />
    </StudioProvider>,
  );
  const reloaded = await screen.findByRole("group", { name: "Asset Potion" });
  expect(within(reloaded).getByText("Đang dùng trong dự án")).toBeVisible();
});

test("a missing keyboard placement action cannot use the validated canvas role and layer path", async () => {
  const { AssetManager } = await assetModule();
  const ready = asset(980, {
    displayName: "Keyboard panel",
    metadata: { ...asset(980).metadata, category: "UI" },
  });
  const client = clientFor(() => [ready]);
  let server = project();
  let revision = 0;
  let placement: ((payload: string) => void) | null = null;
  const transport = async (
    _gameId: string,
    batch: { mutations: StudioMutation[] },
  ) => {
    server = applyProjectMutations(server, batch.mutations);
    revision += 1;
    return { document: server, revision };
  };
  const CanvasWithPlacement = SceneCanvas as ComponentType<{
    scene: EngineProjectV2Type["scenes"][number];
    assetMetadata: GameAssetSummary[];
    registerAssetPlacement: (
      handler: ((payload: string) => void) | null,
    ) => void;
  }>;
  function Workspace() {
    const studio = useStudio();
    const [metadata, setMetadata] = useState<GameAssetSummary[]>([]);
    return (
      <>
        <AssetManager
          client={client}
          onAssetsChange={setMetadata}
          onPlaceAsset={(payload) => placement?.(payload)}
        />
        <CanvasWithPlacement
          scene={studio.state.document.scenes[0]!}
          assetMetadata={metadata}
          registerAssetPlacement={(handler) => {
            placement = handler;
          }}
        />
      </>
    );
  }
  render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: server, revision }}
      storage={{ read: async () => null, write: async () => {} }}
      transport={transport}
      debounceMs={0}
    >
      <Workspace />
    </StudioProvider>,
  );

  const add = await screen.findByRole("button", {
    name: "Thêm Keyboard panel vào Scene",
  });
  add.focus();
  fireEvent.keyDown(add, { key: "Enter" });
  fireEvent.click(add);

  await waitFor(() => expect(server.assetIds).toEqual([ready.id]));
  const created = server.scenes[0]!.objects[0]!;
  expect(created.layerId).toBe(id(4));
  expect(
    created.components.find((component) => component.type === "UIImage")
      ?.properties.assetId,
  ).toBe(ready.id);
});
