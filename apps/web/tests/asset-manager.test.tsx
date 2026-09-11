import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
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
  get: (gameId: string, assetId: string) => Promise<GameAssetSummary>;
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
    <Wrapper document={project([used.id])}>
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

test("a READY-only reload cannot hide a tombstoned asset that the canonical document still references", async () => {
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
  expect(within(card).getByText("Đang dùng trong dự án")).toBeVisible();
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
