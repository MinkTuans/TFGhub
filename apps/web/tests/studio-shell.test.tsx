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
import { recordingContext } from "./canvas-context";

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  sessionStorage.clear();
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
  fireEvent.click(screen.getByRole("button", { name: "Thiết kế" }));
  return {
    get studio() {
      return studio;
    },
  };
}

test("ENGINE server route loads owner/project identity and opens accessible Studio navigation", async () => {
  preparePage();
  render(await GameWorkspacePage({ params: Promise.resolve({ id: game.id }) }));
  expect(screen.getByRole("link", { name: "Về Xưởng sáng tạo" })).toHaveAttribute(
    "href",
    "/studio",
  );
  expect(screen.getByRole("main", { name: "Xưởng sáng tạo trò chơi" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Tên trò chơi" })).toHaveValue(
    "Đảo nhỏ",
  );
  expect(screen.getByRole("combobox", { name: "Cảnh hiện tại" })).toHaveValue(
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
      screen.queryByRole("main", { name: "Xưởng sáng tạo trò chơi" }),
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
    expect(screen.getByRole("link", { name: "Về Xưởng sáng tạo" })).toHaveAttribute(
      "href",
      "/studio",
    );
    expect(
      screen.queryByRole("textbox", { name: "Tên trò chơi" }),
    ).not.toBeInTheDocument();
  },
);

test("conflict discard requires TFG confirmation; cancel preserves work and reapply stays explicit", async () => {
  const remote = structuredClone(project);
  remote.scenes[0].name = "Bản máy chủ";
  let reads = 0;
  const h = await shell({
    debounceMs: 0,
    transport: async () => {
      throw new StudioConflictError(4);
    },
    readHead: async () => {
      reads += 1;
      return { revision: 4, document: remote };
    },
  });
  act(() =>
    h.studio.dispatch({
      type: "commit",
      mutations: [{ type: "scene.rename", sceneId: id(2), name: "Bản cục bộ" }],
    }),
  );
  await waitFor(() => expect(h.studio.state.status).toBe("CONFLICT"));
  const original = structuredClone(h.studio.state.pending);
  const discard = screen.getByRole("button", {
    name: "Bỏ thay đổi và tải bản máy chủ",
  });
  expect(
    screen.getByRole("button", { name: "Áp dụng lại thay đổi của tôi" }),
  ).toBeEnabled();
  discard.focus();
  fireEvent.click(discard);
  const dialog = screen.getByRole("dialog", { name: "Bỏ thay đổi cục bộ?" });
  expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(discard).toHaveFocus();
  expect(reads).toBe(0);
  expect(h.studio.state.pending).toEqual(original);
  fireEvent.click(discard);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Bỏ thay đổi và tải lại",
    }),
  );
  await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
  expect(reads).toBe(1);
  expect(h.studio.state.document.scenes[0].name).toBe("Bản máy chủ");
  expect(h.studio.state.pending).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("conflict resolution feedback keeps both choices actionable after failure and disables authoring during fetch", async () => {
  let reject!: (error: Error) => void;
  const h = await shell({
    debounceMs: 0,
    transport: async () => {
      throw new StudioConflictError(4);
    },
    readHead: () =>
      new Promise((_yes, no) => {
        reject = no;
      }),
  });
  act(() =>
    h.studio.dispatch({
      type: "commit",
      mutations: [{ type: "scene.rename", sceneId: id(2), name: "Giữ lại" }],
    }),
  );
  await waitFor(() => expect(h.studio.state.status).toBe("CONFLICT"));
  fireEvent.click(
    screen.getByRole("button", { name: "Áp dụng lại thay đổi của tôi" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Áp dụng lại thay đổi của tôi" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Bỏ thay đổi và tải bản máy chủ" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Hoàn tác" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Thêm Cảnh" })).toBeDisabled();
  await act(async () => reject(new Error("offline")));
  expect(screen.getByRole("alert")).toHaveTextContent(/thử lại/i);
  expect(
    screen.getByRole("button", { name: "Áp dụng lại thay đổi của tôi" }),
  ).toBeEnabled();
  expect(h.studio.state.document.scenes[0].name).toBe("Giữ lại");
});

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
  const title = screen.getByRole("textbox", { name: "Tên trò chơi" });
  fireEvent.change(title, { target: { value: "  Đảo mùa hè  " } });
  expect(
    screen.getByRole("status", { name: "Trạng thái tên trò chơi" }),
  ).toHaveTextContent("Chưa lưu");
  fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
  expect(title).toBeDisabled();
  expect(
    screen.getByRole("status", { name: "Trạng thái tên trò chơi" }),
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
    screen.getByRole("status", { name: "Trạng thái tên trò chơi" }),
  ).toHaveTextContent("Đã lưu");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(h.studio.state.document).toEqual(project);
  expect(h.studio.state.history.past).toHaveLength(0);
});

test("whitespace-only titles cannot be saved and keyboard tooltips explain the control", async () => {
  await shell();
  const title = screen.getByRole("textbox", { name: "Tên trò chơi" });
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.submit(title.closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("1–80");
  const settings = screen.getByRole("button", { name: "Cài đặt Xưởng sáng tạo" });
  fireEvent.focus(settings);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bố cục");
  expect(settings).toHaveAccessibleDescription(/Bố cục/);
  fireEvent.keyDown(settings, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("current Scene navigation synchronizes panels without changing the canonical project", async () => {
  const h = await shell();
  fireEvent.change(screen.getByRole("combobox", { name: "Cảnh hiện tại" }), {
    target: { value: id(3) },
  });
  expect(
    within(screen.getByRole("region", { name: "Tổng quan Cảnh" })).getByRole(
      "heading",
      { name: "Bến cảng" },
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Bến cảng" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("region", { name: "Thông tin Cảnh" }),
  ).toHaveTextContent("800 × 480");
  fireEvent.click(screen.getByRole("button", { name: "Khởi đầu" }));
  expect(screen.getByRole("combobox", { name: "Cảnh hiện tại" })).toHaveValue(
    id(2),
  );
  expect(h.studio.state.document).toEqual(project);
  expect(h.studio.state.pending).toBeNull();
});

test("panel disclosures and settings change actual visibility and remain reversible", async () => {
  await shell();
  fireEvent.click(
    screen.getByRole("button", { name: "Thu gọn danh sách Cảnh" }),
  );
  expect(
    screen.queryByRole("button", { name: "Khởi đầu" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mở danh sách Cảnh" }));
  expect(screen.getByRole("button", { name: "Khởi đầu" })).toBeVisible();
  const settings = screen.getByRole("button", { name: "Cài đặt Xưởng sáng tạo" });
  fireEvent.click(settings);
  expect(settings).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Hiện thông tin Cảnh" }),
  );
  expect(
    screen.queryByRole("region", { name: "Thông tin Cảnh" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Hiện thông tin Cảnh" }),
  );
  expect(screen.getByRole("region", { name: "Thông tin Cảnh" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("region", { name: "Cài đặt Xưởng sáng tạo" }), {
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
      mutations: [{ type: "scene.rename", sceneId: id(2), name: "Cảnh mới" }],
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
  expect(h.studio.state.document.scenes[0].name).toBe("Cảnh mới");
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

test("the shell preserves a mounted canvas across tasks without browser alerts", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  await shell();
  const canvas = screen.getByRole("img", { name: "Cảnh: Khởi đầu" });
  fireEvent.click(screen.getByRole("button", { name: "Tài nguyên" }));
  expect(screen.getByRole("heading", { name: "Nhập ảnh / âm thanh" })).toBeVisible();
  expect(canvas).toBeInTheDocument();
  expect(canvas).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Thiết kế" }));
  expect(screen.getByRole("img", { name: "Cảnh: Khởi đầu" })).toBe(canvas);
  expect(alert).not.toHaveBeenCalled();
});

test("the real center canvas redraws the current canonical scene at DPR without creating mutations or gestures", async () => {
  const { context, calls } = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 640,
    bottom: 480,
    width: 640,
    height: 480,
    toJSON: () => ({}),
  });
  vi.stubGlobal("devicePixelRatio", 2);
  const h = await shell();
  const canvas = screen.getByRole("img", { name: "Cảnh: Khởi đầu" });
  expect(canvas).toHaveAttribute("width", "1280");
  expect(canvas).toHaveAttribute("height", "960");
  expect(calls).toContainEqual({ name: "fillRect", args: [0, 0, 640, 480] });
  calls.length = 0;
  fireEvent.change(screen.getByRole("combobox", { name: "Cảnh hiện tại" }), {
    target: { value: id(3) },
  });
  const switchedCanvas = screen.getByRole("img", { name: "Cảnh: Bến cảng" });
  expect(switchedCanvas).toHaveAttribute("width", "1280");
  expect(calls).toContainEqual({ name: "fillRect", args: [0, 0, 800, 480] });
  fireEvent.pointerDown(switchedCanvas, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(switchedCanvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerUp(switchedCanvas);
  expect(h.studio.state.document).toEqual(project);
  expect(h.studio.state.pending).toBeNull();
  expect(h.studio.state.history.past).toEqual([]);
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
    await waitFor(() => expect(reject).toBeTypeOf("function"));
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

test("task navigation exposes assets, visual gameplay, code, preview and help", async () => {
 await shell();
 for (const name of ["Bắt đầu", "Thiết kế", "Tài nguyên", "Gameplay", "Code", "Chơi thử & xuất bản", "Hướng dẫn"]) expect(screen.getByRole("button", {name})).toBeVisible();
 fireEvent.click(screen.getByRole("button", {name:"Gameplay"}));
 expect(screen.getByRole("heading", {name:"Luật chơi trực quan"})).toBeVisible();
 expect(screen.getByRole("button", {name:"Tạo luật"})).toBeVisible();
 fireEvent.click(screen.getByRole("button", {name:"Code"}));
 expect(screen.getByRole("button", {name:"Script mới"})).toBeVisible();
 fireEvent.click(screen.getByRole("button", {name:"Chơi thử & xuất bản"}));
 expect(screen.getByRole("button", {name:"Tạo bản chơi thử"})).toBeEnabled();
 expect(screen.getByRole("button", {name:"Gửi duyệt"})).toBeDisabled();
});

test("visual gameplay creates a canonical start rule and global variable", async () => {
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Gameplay" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tên luật" }), {
    target: { value: "Thưởng điểm khi bắt đầu" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tạo luật" }));
  expect(h.studio.state.document.events).toHaveLength(1);
  expect(h.studio.state.document.events[0]).toMatchObject({
    name: "Thưởng điểm khi bắt đầu",
    trigger: { type: "ON_START" },
    steps: [{ type: "ADD_SCORE", amount: 10 }],
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Tên biến" }), {
    target: { value: "level" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thêm biến" }));
  expect(h.studio.state.document.variables.global).toHaveLength(1);
  expect(h.studio.state.document.variables.global[0]).toMatchObject({
    name: "level",
    type: "NUMBER",
    initialValue: 0,
  });
});

test("code saves a canonical scene-attached script and remains undoable", async () => {
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Code" }));
  fireEvent.click(screen.getByRole("button", { name: "Script mới" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tên script" }), { target: { value: "Chào đảo" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu script vào dự án" }));
  await waitFor(() => expect(h.studio.state.document.scripts).toHaveLength(1));
  expect(h.studio.state.document.scripts[0]).toMatchObject({ name: "Chào đảo", capabilities: ["SHOW_DIALOGUE"], attachments: [{ type: "SCENE", sceneId: id(2) }] });
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(h.studio.state.document.scripts).toHaveLength(0);
});

test("JSON import rejects malformed data and preserves current project identity", async () => {
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
  const input = screen.getByLabelText("Nhập dự án JSON", { selector: "input" });
  fireEvent.change(input, { target: { files: [{ size: 20, text: async () => '{"schemaVersion":2}' }] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("JSON không hợp lệ");
  expect(h.studio.state.document).toEqual(project);
  const imported = { ...project, projectId: id(98), scenes: project.scenes.map((scene) => ({ ...scene, name: "Cảnh nhập" })) };
  fireEvent.change(input, { target: { files: [{ size: 2000, text: async () => JSON.stringify(imported) }] } });
  await waitFor(() => expect(h.studio.state.document.scenes[0].name).toBe("Cảnh nhập"));
  expect(h.studio.state.document.projectId).toBe(project.projectId);
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(h.studio.state.document).toEqual(project);
});

test("build only runs for a saved head and an edit immediately removes the sandboxed preview", async () => {
  const { api } = await import("../lib/api-client");
  const post = vi.spyOn(api, "post").mockResolvedValue({ ...game, artifactReady: true, artifactVersion: 1 });
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Chơi thử & xuất bản" }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản chơi thử" }));
  await waitFor(() => expect(screen.getByTitle("Chơi thử trò chơi")).toBeVisible());
  expect(post).toHaveBeenCalledWith(`/games/${game.id}/build`, {});
  expect(screen.getByTitle("Chơi thử trò chơi")).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
  act(() => h.studio.dispatch({ type: "commit", mutations: [{ type: "scene.rename", sceneId: id(2), name: "Chưa lưu" }] }));
  expect(screen.queryByTitle("Chơi thử trò chơi")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tạo bản chơi thử" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
});

test("JS file import stays a draft until explicit canonical save", async () => {
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Code" }));
  fireEvent.change(screen.getByLabelText("Nhập JavaScript"), { target: { files: [{ name: "hello.js", size: 50, text: async () => 'api.showDialogue("Hello");' }] } });
  expect(await screen.findByRole("textbox", { name: "Mã JavaScript" })).toHaveValue('api.showDialogue("Hello");');
  expect(h.studio.state.document.scripts).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: "Hiện hội thoại" }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu script vào dự án" }));
  expect(h.studio.state.document.scripts[0]).toMatchObject({ name: "hello.js", source: 'api.showDialogue("Hello");', capabilities: ["SHOW_DIALOGUE"] });
});

test("foreign JSON asset ownership failure preserves the original project", async () => {
  const { api, ApiError } = await import("../lib/api-client");
  vi.spyOn(api, "get").mockRejectedValue(new ApiError(403, "You do not own this asset"));
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
  fireEvent.change(screen.getByLabelText("Nhập dự án JSON", { selector: "input" }), { target: { files: [{ size: 2000, text: async () => JSON.stringify({ ...project, assetIds: [id(99)] }) }] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể nhập tài nguyên");
  expect(h.studio.state.document).toEqual(project);
});

test("a collectible preset includes a trigger collider and can be undone atomically", async () => {
 const h = await shell();
 fireEvent.click(screen.getByRole("button", { name: "Vật phẩm" }));
 expect(h.studio.state.document.scenes[0].objects[0].components).toEqual(expect.arrayContaining([expect.objectContaining({ type: "InventoryItem" }), expect.objectContaining({ type: "Collider", properties: expect.objectContaining({ isTrigger: true }) })]));
 fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
 expect(h.studio.state.document.scenes[0].objects).toHaveLength(0);
});

test("an enemy preset creates a visible collidable health object atomically", async () => {
  const h = await shell();
  fireEvent.click(screen.getByRole("button", { name: "Kẻ địch" }));
  expect(h.studio.state.document.scenes[0].objects[0]).toMatchObject({
    name: "Kẻ địch",
    components: expect.arrayContaining([
      expect.objectContaining({ type: "SpriteRenderer" }),
      expect.objectContaining({ type: "Collider" }),
      expect.objectContaining({ type: "Health" }),
    ]),
  });
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  expect(h.studio.state.document.scenes[0].objects).toHaveLength(0);
});

test("switching from dirty script prompts and cancel preserves source", async () => {
 await shell();
 fireEvent.click(screen.getByRole("button", { name: "Code" }));
 fireEvent.click(screen.getByRole("button", { name: "Script mới" }));
 fireEvent.change(screen.getByRole("textbox", { name: "Mã JavaScript" }), { target: { value: 'api.showDialogue("keep me");' } });
 fireEvent.click(screen.getByRole("button", { name: "Script mới" }));
 const dialog = screen.getByRole("dialog", { name: "Script có thay đổi chưa lưu" });
 fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
 expect(screen.getByRole("textbox", { name: "Mã JavaScript" })).toHaveValue('api.showDialogue("keep me");');
});
