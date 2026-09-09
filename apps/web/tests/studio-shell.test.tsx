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
import type {
  EngineProjectReadResponse,
  EngineProjectV2Type,
  GameSummary,
} from "@indieforge/contracts";
import GameWorkspacePage from "../app/studio/games/[id]/page";
import { privateGet } from "../lib/session";
import {
  StudioProvider,
  useStudio,
  type StudioProviderProps,
} from "../components/studio/studio-provider";
import { browserRecoveryStorage } from "../components/studio/studio-recovery";
import { StudioConflictError } from "../components/studio/studio-state";

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const game: GameSummary = {
  id: "engine-game",
  slug: "island",
  title: "Đảo nhỏ",
  description: "",
  visibility: "DRAFT",
  accessMode: "GUEST_ALLOWED",
  moderationState: "CLEAR",
  sourceType: "ENGINE",
  reviewState: "DRAFT",
  projectData: null,
  artifactVersion: 0,
  artifactReady: false,
  coverVersion: 0,
  coverContentType: null,
  viewportWidth: 16,
  viewportHeight: 9,
  reviewNote: null,
  submittedAt: null,
  reviewedAt: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};
const project: EngineProjectV2Type = {
  schemaVersion: 2,
  projectId: id(1),
  engineFamily: "TFG_ENGINE",
  entrySceneId: id(2),
  settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
  assetIds: [],
  scenes: [0, 1].map((index) => ({
    id: id(2 + index),
    key: `scene-${index}`,
    name: index ? "Bến cảng" : "Khởi đầu",
    type: "MIXED",
    order: index,
    width: index ? 800 : 640,
    height: 480,
    background: { color: "#102030", assetId: null },
    settings: {
      gravityX: 0,
      gravityY: 0,
      grid: { enabled: false, size: 32, snap: false },
    },
    layers: [
      {
        id: id(4 + index),
        name: "Thế giới",
        type: "WORLD",
        order: 0,
        visible: true,
        locked: false,
      },
    ],
    objects: [],
  })),
  variables: { global: [], player: [], scene: {} },
  prefabs: [],
  events: [],
  modules: [],
  scripts: [],
};
const read: EngineProjectReadResponse = {
  status: "SUPPORTED",
  project,
  revision: {
    revisionNumber: 0,
    schemaVersion: 2,
    contentHash: "a".repeat(64),
    byteSize: 100,
    retention: "PINNED",
    createdAt: game.createdAt,
  },
};
function preparePage(
  source: GameSummary = game,
  response: EngineProjectReadResponse = read,
) {
  vi.mocked(privateGet).mockImplementation(async (path) => {
    if (path === `/games/${source.id}`) return source;
    if (path === `/games/${source.id}/engine-project`) return response;
    if (path === "/auth/me")
      return { id: "owner", email: "owner@example.test", role: "USER" };
    throw new Error(`Unexpected private GET ${path}`);
  });
  vi.spyOn(browserRecoveryStorage, "read").mockResolvedValue(null);
  vi.spyOn(browserRecoveryStorage, "write").mockResolvedValue();
}
async function shell(overrides: Partial<StudioProviderProps> = {}) {
  // The missing feature must be an assertion failure, not an import error, during RED.
  const files = import.meta.glob("../components/studio/studio-shell.tsx");
  expect(files, "Unified shell is not implemented").toHaveProperty([
    "../components/studio/studio-shell.tsx",
  ]);
  const { StudioShell } = (await files[
    "../components/studio/studio-shell.tsx"
  ]()) as typeof import("../components/studio/studio-shell");
  let studio!: ReturnType<typeof useStudio>;
  function Probe() {
    const value = useStudio();
    useEffect(() => {
      studio = value;
    });
    return null;
  }
  render(
    <StudioProvider
      identity={{
        userId: "owner",
        gameId: game.id,
        projectId: project.projectId,
      }}
      initial={{ document: project, revision: 0 }}
      storage={{ read: async () => null, write: async () => {} }}
      debounceMs={60_000}
      {...overrides}
    >
      <StudioShell initialGame={game} />
      <Probe />
    </StudioProvider>,
  );
  await act(async () => {});
  return {
    get studio() {
      return studio;
    },
  };
}

test("ENGINE server route loads owner/project identity and opens accessible Studio navigation", async () => {
  preparePage();
  render(await GameWorkspacePage({ params: Promise.resolve({ id: game.id }) }));
  expect(screen.getByRole("link", { name: "Về Studio" })).toHaveAttribute(
    "href",
    "/studio",
  );
  expect(screen.getByRole("main", { name: "Game Studio" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Tên game" })).toHaveValue(
    "Đảo nhỏ",
  );
  expect(screen.getByRole("combobox", { name: "Scene hiện tại" })).toHaveValue(
    id(2),
  );
  expect(screen.getByText("Bản nháp")).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByRole("status", { name: "Trạng thái dự án" }),
    ).toHaveTextContent("Đã lưu"),
  );
  expect(privateGet).toHaveBeenCalledWith(`/games/${game.id}/engine-project`);
  expect(privateGet).toHaveBeenCalledWith("/auth/me");
});

test.each(["UPLOAD", "CODE", "STORY", "PLATFORMER"] as const)(
  "%s still renders the unchanged legacy workspace without engine reads",
  async (sourceType) => {
    preparePage({ ...game, sourceType });
    render(
      await GameWorkspacePage({ params: Promise.resolve({ id: game.id }) }),
    );
    expect(
      screen.getByRole("heading", { name: "Ảnh bìa và thông tin" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu hiển thị" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
    expect(
      screen.queryByRole("main", { name: "Game Studio" }),
    ).not.toBeInTheDocument();
    expect(privateGet).toHaveBeenCalledTimes(1);
  },
);

test.each([
  {
    status: "READ_ONLY",
    reason: "UNSUPPORTED_FUTURE_SCHEMA",
    raw: { schemaVersion: 99 },
    schemaVersion: 99,
    diagnostics: [],
  },
  {
    status: "READ_ONLY",
    reason: "INVALID_PROJECT",
    raw: {},
    schemaVersion: null,
    diagnostics: ["Invalid"],
  },
  { ...read, revision: null },
  { ...read, project: {} },
] as EngineProjectReadResponse[])(
  "unreadable ENGINE documents show a recoverable message without a writable provider",
  async (response) => {
    preparePage(game, response);
    render(
      await GameWorkspacePage({ params: Promise.resolve({ id: game.id }) }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa thể mở dự án");
    expect(screen.getByRole("link", { name: "Về Studio" })).toHaveAttribute(
      "href",
      "/studio",
    );
    expect(
      screen.queryByRole("textbox", { name: "Tên game" }),
    ).not.toBeInTheDocument();
  },
);

test("title submits only trimmed owner metadata, indicates pending, and preserves a failed edit for retry", async () => {
  const h = await shell();
  let resolve!: (response: Response) => void;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return new Promise<Response>((done) => {
      resolve = done;
    });
  });
  const title = screen.getByRole("textbox", { name: "Tên game" });
  fireEvent.change(title, { target: { value: "  Đảo mùa hè  " } });
  expect(
    screen.getByRole("status", { name: "Trạng thái tên game" }),
  ).toHaveTextContent("Chưa lưu");
  fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
  expect(title).toBeDisabled();
  expect(
    screen.getByRole("status", { name: "Trạng thái tên game" }),
  ).toHaveTextContent("Đang lưu");
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toMatch(/\/games\/engine-game$/);
  expect(requests[0].init).toMatchObject({
    method: "PATCH",
    credentials: "include",
    body: '{"title":"Đảo mùa hè"}',
  });
  await act(async () => resolve(new Response("{}", { status: 503 })));
  expect(screen.getByRole("alert")).toHaveTextContent("Không thể lưu tên");
  expect(title).toHaveValue("  Đảo mùa hè  ");
  fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
  await act(async () =>
    resolve(new Response(JSON.stringify({ ...game, title: "Đảo mùa hè" }))),
  );
  expect(title).toHaveValue("Đảo mùa hè");
  expect(
    screen.getByRole("status", { name: "Trạng thái tên game" }),
  ).toHaveTextContent("Đã lưu");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(h.studio.state.document).toEqual(project);
  expect(h.studio.state.history.past).toHaveLength(0);
});

test("whitespace-only titles cannot be saved and keyboard tooltips explain the control", async () => {
  await shell();
  const title = screen.getByRole("textbox", { name: "Tên game" });
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.submit(title.closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("1–80");
  const settings = screen.getByRole("button", { name: "Cài đặt Studio" });
  fireEvent.focus(settings);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bố cục");
  expect(settings).toHaveAccessibleDescription(/Bố cục/);
  fireEvent.keyDown(settings, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("current Scene navigation synchronizes panels without changing the canonical project", async () => {
  const h = await shell();
  fireEvent.change(screen.getByRole("combobox", { name: "Scene hiện tại" }), {
    target: { value: id(3) },
  });
  expect(
    within(screen.getByRole("region", { name: "Tổng quan Scene" })).getByRole(
      "heading",
      { name: "Bến cảng" },
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Bến cảng" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("region", { name: "Thông tin Scene" }),
  ).toHaveTextContent("800 × 480");
  fireEvent.click(screen.getByRole("button", { name: "Khởi đầu" }));
  expect(screen.getByRole("combobox", { name: "Scene hiện tại" })).toHaveValue(
    id(2),
  );
  expect(h.studio.state.document).toEqual(project);
  expect(h.studio.state.pending).toBeNull();
});

test("panel disclosures and settings change actual visibility and remain reversible", async () => {
  await shell();
  fireEvent.click(
    screen.getByRole("button", { name: "Thu gọn danh sách Scene" }),
  );
  expect(
    screen.queryByRole("button", { name: "Khởi đầu" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mở danh sách Scene" }));
  expect(screen.getByRole("button", { name: "Khởi đầu" })).toBeVisible();
  const settings = screen.getByRole("button", { name: "Cài đặt Studio" });
  fireEvent.click(settings);
  expect(settings).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Hiện thông tin Scene" }),
  );
  expect(
    screen.queryByRole("region", { name: "Thông tin Scene" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Hiện thông tin Scene" }),
  );
  expect(screen.getByRole("region", { name: "Thông tin Scene" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("region", { name: "Cài đặt Studio" }), {
    key: "Escape",
  });
  expect(settings).toHaveAttribute("aria-expanded", "false");
  expect(settings).toHaveFocus();
});

test("undo and redo use the existing provider history and expose project save state", async () => {
  const h = await shell();
  const undo = screen.getByRole("button", { name: "Hoàn tác" });
  const redo = screen.getByRole("button", { name: "Làm lại" });
  expect(undo).toBeDisabled();
  expect(redo).toBeDisabled();
  act(() =>
    h.studio.dispatch({
      type: "commit",
      mutations: [{ type: "scene.rename", sceneId: id(2), name: "Scene mới" }],
    }),
  );
  expect(
    screen.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveTextContent("Chưa lưu");
  expect(undo).toBeEnabled();
  fireEvent.click(undo);
  expect(h.studio.state.document.scenes[0].name).toBe("Khởi đầu");
  expect(redo).toBeEnabled();
  fireEvent.click(redo);
  expect(h.studio.state.document.scenes[0].name).toBe("Scene mới");
});

test("failed recovery is visible and its retry action reads recovery again", async () => {
  let unavailable = true;
  await shell({
    storage: {
      read: async () => {
        if (unavailable) throw new Error("blocked");
        return null;
      },
      write: async () => {},
    },
  });
  expect(
    screen.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveTextContent("Chưa đồng bộ");
  expect(screen.getByRole("alert")).toHaveTextContent("khôi phục");
  unavailable = false;
  fireEvent.click(screen.getByRole("button", { name: "Thử đồng bộ lại" }));
  await waitFor(() =>
    expect(
      screen.getByRole("status", { name: "Trạng thái dự án" }),
    ).toHaveTextContent("Đã lưu"),
  );
  expect(
    screen.queryByRole("button", { name: "Thử đồng bộ lại" }),
  ).not.toBeInTheDocument();
});

test("the shell never exposes future controls, a pretend canvas, or browser alerts", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  await shell();
  expect(
    screen.queryByRole("button", {
      name: /Chạy thử|Xuất bản|AI|Thêm đối tượng|Tài nguyên|Mã nguồn|Kiểm tra/,
    }),
  ).not.toBeInTheDocument();
  expect(document.querySelector("canvas, iframe")).toBeNull();
  expect(screen.getByText(/máy tính/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cài đặt Studio" }));
  expect(alert).not.toHaveBeenCalled();
});

test.each([
  { error: new Error("offline"), status: "Chưa đồng bộ", retry: true },
  {
    error: new StudioConflictError(4),
    status: "Xung đột phiên bản",
    retry: false,
  },
])(
  "an in-flight project save ends visibly as $status while retaining local work",
  async ({ error, status, retry }) => {
    let reject!: (reason: unknown) => void;
    const h = await shell({
      debounceMs: 0,
      transport: () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    });
    act(() =>
      h.studio.dispatch({
        type: "commit",
        mutations: [
          { type: "scene.rename", sceneId: id(2), name: "Giữ bản này" },
        ],
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Trạng thái dự án" }),
      ).toHaveTextContent("Đang lưu"),
    );
    await act(async () => reject(error));
    expect(
      screen.getByRole("status", { name: "Trạng thái dự án" }),
    ).toHaveTextContent(status);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(!!screen.queryByRole("button", { name: "Thử đồng bộ lại" })).toBe(
      retry,
    );
    expect(h.studio.state.document.scenes[0].name).toBe("Giữ bản này");
    expect(h.studio.state.pending?.mutations).toEqual([
      { type: "scene.rename", sceneId: id(2), name: "Giữ bản này" },
    ]);
  },
);
