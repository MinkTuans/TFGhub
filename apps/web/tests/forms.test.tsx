import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AuthForm } from "../components/auth-form";
import { ProfileForm } from "../components/profile-form";
import { GameForm } from "../components/game-form";
import { GameWorkspace } from "../components/game-workspace";
import { GamePreview } from "../components/game-preview";
import { UploadEditor } from "../components/upload-editor";
import { ApiError } from "../lib/api-client";
import { uploadGame } from "../lib/game-upload";
import { LogoutButton } from "../components/logout-button";
import {
  ModerationQueue,
  type ModerationGame,
} from "../components/moderation-queue";
import type { GameSummary } from "@indieforge/contracts";

// Navigation needs a Next router; the form, validation and HTTP client stay real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../lib/game-upload", () => ({ uploadGame: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(uploadGame).mockReset();
});

function codeGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "game-1",
    slug: "code-quest",
    title: "Code quest",
    description: "",
    visibility: "DRAFT",
    accessMode: "GUEST_ALLOWED",
    moderationState: "CLEAR",
    sourceType: "CODE",
    reviewState: "DRAFT",
    projectData: {
      sourceType: "CODE",
      html: "<h1>Saved quest</h1>",
      css: "h1 { color: rebeccapurple; }",
      javascript: "window.saved = true;",
    },
    artifactVersion: 1,
    artifactReady: true,
    coverVersion: 0,
    coverContentType: null,
    viewportWidth: 16,
    viewportHeight: 9,
    reviewNote: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: "2026-09-07T07:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

function storyGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    ...codeGame({
      sourceType: "STORY",
      projectData: {
        sourceType: "STORY",
        startSceneId: "opening",
        scenes: [
          {
            id: "opening",
            speaker: "Guide",
            dialogue: "Choose a path.",
            backgroundColor: "#112233",
            choices: [],
          },
        ],
      },
      artifactVersion: 1,
      artifactReady: true,
    }),
    ...overrides,
  };
}

function platformerGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    ...codeGame({
      sourceType: "PLATFORMER",
      projectData: {
        sourceType: "PLATFORMER",
        canvas: { width: 640, height: 480 },
        backgroundColor: "#111827",
        player: { x: 24, y: 0, color: "#2563eb" },
        goal: { x: 300, y: 416, color: "#16a34a" },
        platforms: [{ x: 0, y: 440, width: 640, height: 40, color: "#6b7280" }],
      },
      artifactVersion: 1,
      artifactReady: true,
    }),
    ...overrides,
  };
}

function moderationGame(id: string, title: string): ModerationGame {
  return {
    id,
    slug: id,
    title,
    description: "A submitted game.",
    accessMode: "GUEST_ALLOWED",
    sourceType: "CODE",
    artifactVersion: 1,
    artifactReady: true,
    submittedAt: "2026-09-07T09:00:00.000Z",
    creator: { id: `creator-${id}`, displayName: "Creator" },
  };
}

test.each(["register", "login"] as const)(
  "%s rejects invalid credentials before sending an HTTP request",
  (mode) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<AuthForm mode={mode} />);
    fireEvent.change(screen.getByLabelText("Thư điện tử"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "short" },
    });
    fireEvent.submit(screen.getByLabelText("Thư điện tử").closest("form")!);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  },
);

test("registration reports the API conflict and permits another attempt", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Email already registered" }), {
        status: 409,
      }),
    ),
  );
  render(<AuthForm mode="register" />);
  fireEvent.change(screen.getByLabelText("Tên hiển thị"), { target: { value: "Minh" } });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: "Password123!" } });
  fireEvent.change(screen.getByLabelText("Thư điện tử"), {
    target: { value: "me@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "Password123!" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tạo tài khoản" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Thư điện tử này đã được đăng ký.",
  );
  expect(screen.getByRole("button", { name: "Tạo tài khoản" })).toBeEnabled();
});

test("draft creation keeps input visible after a duplicate slug rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Game slug already exists" }), {
        status: 409,
      }),
    ),
  );
  render(<GameForm />);
  fireEvent.change(screen.getByLabelText("Tên trò chơi"), {
    target: { value: "My game" },
  });
  fireEvent.change(screen.getByLabelText("Đường dẫn"), {
    target: { value: "my-game" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tạo bản nháp" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Đường dẫn trò chơi đã tồn tại. Hãy chọn đường dẫn khác.",
  );
  expect(screen.getByLabelText("Tên trò chơi")).toHaveValue("My game");
  expect(screen.getByRole("button", { name: "Tạo bản nháp" })).toBeEnabled();
});

test("draft creation submits the selected source type", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "game-1" })));
  vi.stubGlobal("fetch", fetch);
  render(<GameForm />);

  fireEvent.change(screen.getByLabelText("Tên trò chơi"), {
    target: { value: "Upload quest" },
  });
  fireEvent.change(screen.getByLabelText("Đường dẫn"), {
    target: { value: "upload-quest" },
  });
  fireEvent.change(screen.getByLabelText("Cách tạo trò chơi"), {
    target: { value: "UPLOAD" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tạo bản nháp" }).closest("form")!,
  );

  await screen.findByRole("button", { name: "Tạo bản nháp" });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    sourceType: "UPLOAD",
  });
});

test("HTML5 upload explains the playable ZIP contract before a creator uploads", () => {
  render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);

  expect(screen.getByText(/index\.html ở thư mục gốc/i)).toBeVisible();
  expect(screen.getByText(/100 MiB/i)).toBeVisible();
  expect(screen.getByText(/400 MiB sau khi giải nén/i)).toBeVisible();
  expect(screen.getByText(/2\.000 mục/i)).toBeVisible();
  expect(screen.getByText(/tệp ảnh, âm thanh và mã dùng đường dẫn tương đối/i)).toBeVisible();
  expect(screen.getByText(/tải xong.*chơi thử.*gửi duyệt/i)).toBeVisible();
});

test("HTML5 upload reports the active transfer and hands a ready preview to the workspace", async () => {
  let complete!: (game: GameSummary) => void;
  vi.mocked(uploadGame).mockImplementation(
    () =>
      new Promise<GameSummary>((resolve) => {
        complete = resolve;
      }),
  );
  const onUploaded = vi.fn();
  render(<UploadEditor gameId="game-1" onUploaded={onUploaded} />);
  const file = new File(["zip"], "ready-game.zip", {
    type: "application/zip",
  });
  const input = screen.getByLabelText("Tệp ZIP HTML5");
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tải trò chơi lên" }).closest("form")!,
  );

  expect(await screen.findByRole("status")).toHaveTextContent(
    "Đang tải ready-game.zip",
  );
  expect(screen.getByLabelText("Tiến trình tải trò chơi")).toBeVisible();

  complete(codeGame({ sourceType: "UPLOAD", projectData: null }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đã tải lên. Bản chơi thử đã sẵn sàng.",
    ),
  );
  expect(onUploaded).toHaveBeenCalledWith(
    expect.objectContaining({ id: "game-1", artifactReady: true }),
  );
});

test("HTML5 upload explains the rejection and makes retry explicit", async () => {
  vi.mocked(uploadGame).mockRejectedValue(
    new ApiError(400, "ZIP requires a root index.html"),
  );
  render(<UploadEditor gameId="game-1" onUploaded={vi.fn()} />);
  Object.defineProperty(screen.getByLabelText("Tệp ZIP HTML5"), "files", {
    value: [new File(["zip"], "missing-entry.zip", { type: "application/zip" })],
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tải trò chơi lên" }).closest("form")!,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Tệp ZIP cần có index.html ở thư mục gốc.",
  );
  expect(
    screen.getByRole("button", { name: "Thử lại tải trò chơi" }),
  ).toBeEnabled();
});

test.each([
  ["Invalid email or password", "Thư điện tử hoặc mật khẩu không đúng."],
  ["Unexpected backend detail", "Không thể đăng nhập. Vui lòng thử lại."],
])("login translates API error %s", async (message, expected) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message }), { status: 401 }),
      ),
  );
  render(<AuthForm mode="login" />);
  fireEvent.change(screen.getByLabelText("Thư điện tử"), {
    target: { value: "me@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "Password123!" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
});

test("build translates unavailable storage without losing the saved source", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Artifact storage is unavailable" }),
          { status: 503 },
        ),
      ),
  );
  render(<GameWorkspace initialGame={codeGame()} />);
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản chơi thử" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Dịch vụ lưu bản chơi thử tạm thời không khả dụng. Vui lòng thử lại sau.",
  );
  expect(screen.getByLabelText("HTML")).toHaveValue("<h1>Saved quest</h1>");
});

test("moderation translates a stale review revision and retains the review card", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Game is not pending review" }),
          { status: 409 },
        ),
      ),
  );
  render(
    <ModerationQueue initialGames={[moderationGame("game-1", "Review me")]} />,
  );
  fireEvent.click(screen.getByText("Kiểm tra bản gửi"));
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Trò chơi không còn chờ duyệt. Hãy tải lại danh sách.",
  );
  expect(screen.getByRole("article", { name: "Review me" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Duyệt" })).toBeEnabled();
});

test("logout reports a network failure and permits another attempt", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  render(<LogoutButton />);

  fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể đăng xuất. Vui lòng thử lại.",
  );
  expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeEnabled();
});

test("moderation keeps every active review disabled when two cards are actioned", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(
    <ModerationQueue
      initialGames={[
        moderationGame("game-1", "First review"),
        moderationGame("game-2", "Second review"),
      ]}
    />,
  );

  const first = screen.getByRole("article", { name: "First review" });
  const second = screen.getByRole("article", { name: "Second review" });
  fireEvent.click(within(first).getByText("Kiểm tra bản gửi"));
  fireEvent.click(within(second).getByText("Kiểm tra bản gửi"));
  fireEvent.click(within(first).getByRole("button", { name: "Duyệt" }));
  fireEvent.click(within(second).getByRole("button", { name: "Duyệt" }));

  for (const card of [first, second]) {
    expect(
      within(card).getAllByRole("button", { name: "Đang duyệt…" }),
    ).toHaveLength(2);
    for (const button of within(card).getAllByRole("button"))
      expect(button).toBeDisabled();
  }
});

test("moderation binds actions to the displayed submission and renders its context", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
  vi.stubGlobal("fetch", fetch);
  render(
    <ModerationQueue initialGames={[moderationGame("game-1", "Review me")]} />,
  );

  const card = screen.getByRole("article", { name: "Review me" });
  expect(within(card).getByText("Nguồn: Trình soạn mã")).toBeVisible();
  expect(within(card).getByText(/Ngày gửi:/)).toBeVisible();
  fireEvent.click(within(card).getByText("Kiểm tra bản gửi"));
  fireEvent.click(within(card).getByRole("button", { name: "Duyệt" }));

  await screen.findByText("Đã duyệt trò chơi.");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    artifactVersion: 1,
    submittedAt: "2026-09-07T09:00:00.000Z",
  });
});

test("story and platformer editors render when crypto.randomUUID is unavailable", () => {
  vi.stubGlobal("crypto", {});
  expect(() =>
    render(<GameWorkspace initialGame={storyGame()} />),
  ).not.toThrow();
  expect(() =>
    render(<GameWorkspace initialGame={platformerGame()} />),
  ).not.toThrow();
});

test("a server-rendered preview uses the browser-safe public API URL", () => {
  vi.stubEnv("API_INTERNAL_URL", "http://private-api:3001");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://public.example/api");
  const html = renderToString(<GamePreview gameId="game-1" revision={3} />);
  expect(html).toContain(
    'src="https://public.example/api/games/game-1/preview/?v=3"',
  );
  expect(html).not.toContain("private-api");
});

test("workspace shows a moderator rejection note to its owner", () => {
  render(
    <GameWorkspace
      initialGame={{
        id: "game-1",
        slug: "upload-quest",
        title: "Upload quest",
        description: "",
        visibility: "DRAFT",
        accessMode: "GUEST_ALLOWED",
        moderationState: "CLEAR",
        sourceType: "UPLOAD",
        reviewState: "REJECTED",
        projectData: null,
        artifactVersion: 1,
        artifactReady: true,
        coverVersion: 0,
        coverContentType: null,
        viewportWidth: 16,
        viewportHeight: 9,
        reviewNote: "Please remove the copyrighted artwork.",
        submittedAt: "2026-09-07T08:00:00.000Z",
        reviewedAt: "2026-09-07T09:00:00.000Z",
        createdAt: "2026-09-07T07:00:00.000Z",
        updatedAt: "2026-09-07T09:00:00.000Z",
      }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Please remove the copyrighted artwork.",
  );
});

test("code editor loads saved HTML, CSS, and JavaScript", () => {
  render(<GameWorkspace initialGame={codeGame()} />);

  expect(screen.getByLabelText("HTML")).toHaveValue("<h1>Saved quest</h1>");
  expect(screen.getByLabelText("CSS")).toHaveValue(
    "h1 { color: rebeccapurple; }",
  );
  expect(screen.getByLabelText("JavaScript")).toHaveValue(
    "window.saved = true;",
  );
});

test("story editor adds and removes scenes and choices", () => {
  render(<GameWorkspace initialGame={storyGame()} />);

  const opening = screen.getByRole("group", { name: "Cảnh 1" });
  fireEvent.click(
    within(opening).getByRole("button", { name: "Thêm lựa chọn" }),
  );
  expect(within(opening).getByLabelText("Nội dung lựa chọn")).toBeVisible();
  fireEvent.click(
    within(opening).getByRole("button", { name: "Xóa lựa chọn" }),
  );
  expect(within(opening).queryByLabelText("Nội dung lựa chọn")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Thêm cảnh" }));
  const added = screen.getByRole("group", { name: "Cảnh 2" });
  expect(within(added).getByLabelText("Mã cảnh")).toHaveValue("scene-2");
  fireEvent.click(within(added).getByRole("button", { name: "Xóa cảnh" }));
  expect(screen.queryByRole("group", { name: "Cảnh 2" })).toBeNull();
});

test("platformer editor adds and removes repeatable platforms", () => {
  render(<GameWorkspace initialGame={platformerGame()} />);

  expect(screen.getByRole("group", { name: "Nền tảng 1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Thêm nền tảng" }));
  const added = screen.getByRole("group", { name: "Nền tảng 2" });
  expect(within(added).getByLabelText("X")).toHaveValue(0);
  expect(within(added).getByLabelText("Chiều rộng")).toHaveValue(160);
  fireEvent.click(within(added).getByRole("button", { name: "Xóa nền tảng" }));
  expect(screen.queryByRole("group", { name: "Nền tảng 2" })).toBeNull();
});

test("platformer editor rejects geometry outside the canvas before saving", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={platformerGame()} />);

  const platform = screen.getByRole("group", { name: "Nền tảng 1" });
  fireEvent.change(within(platform).getByLabelText("Chiều rộng"), {
    target: { value: "641" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu trò chơi đi cảnh" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Nền tảng phải nằm trong khung vẽ.",
  );
  expect(within(platform).getByLabelText("Chiều rộng")).toHaveValue(641);
  expect(fetch).not.toHaveBeenCalled();
});

test("platformer editor retains values after a failed save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Platformer could not be saved" }),
        {
          status: 503,
        },
      ),
    ),
  );
  render(<GameWorkspace initialGame={platformerGame()} />);

  fireEvent.change(screen.getByLabelText("Vị trí X nhân vật"), {
    target: { value: "42" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu trò chơi đi cảnh" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
  expect(screen.getByLabelText("Vị trí X nhân vật")).toHaveValue(42);
});

test("story editor reports duplicate scene IDs and missing choice targets before saving", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={storyGame()} />);

  fireEvent.click(screen.getByRole("button", { name: "Thêm cảnh" }));
  const added = screen.getByRole("group", { name: "Cảnh 2" });
  fireEvent.change(within(added).getByLabelText("Mã cảnh"), {
    target: { value: "opening" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu cốt truyện" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Mỗi cảnh phải có mã riêng.",
  );
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.change(within(added).getByLabelText("Mã cảnh"), {
    target: { value: "ending" },
  });
  const opening = screen.getByRole("group", { name: "Cảnh 1" });
  fireEvent.click(
    within(opening).getByRole("button", { name: "Thêm lựa chọn" }),
  );
  fireEvent.change(within(opening).getByLabelText("Mã cảnh đích"), {
    target: { value: "missing" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu cốt truyện" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Lựa chọn phải dẫn đến một cảnh có sẵn.",
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("story editor retains input after a failed save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Story could not be saved" }), {
        status: 503,
      }),
    ),
  );
  render(<GameWorkspace initialGame={storyGame()} />);

  const opening = screen.getByRole("group", { name: "Cảnh 1" });
  fireEvent.change(within(opening).getByLabelText("Lời thoại"), {
    target: { value: "The story survives the error." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu cốt truyện" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
  expect(within(opening).getByLabelText("Lời thoại")).toHaveValue(
    "The story survives the error.",
  );
});

test("story build refreshes the sandboxed preview and enables submission", async () => {
  const saved = storyGame({ artifactReady: false });
  const built = { ...saved, artifactVersion: 2, artifactReady: true };
  const submitted = { ...built, reviewState: "PENDING" as const };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
    .mockResolvedValueOnce(new Response(JSON.stringify(built)))
    .mockResolvedValueOnce(new Response(JSON.stringify(submitted)));
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={storyGame()} />);

  fireEvent.click(screen.getByRole("button", { name: "Lưu cốt truyện" }));
  await screen.findByRole("button", { name: "Tạo bản chơi thử" });
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Tạo bản chơi thử" }));
  const preview = await screen.findByTitle("Chơi thử trò chơi");
  expect(preview).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=2",
  );
  expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    sourceType: "STORY",
    startSceneId: "opening",
    scenes: [
      {
        id: "opening",
        speaker: "Guide",
        dialogue: "Choose a path.",
        backgroundColor: "#112233",
        choices: [],
      },
    ],
  });
});

test("platformer build refreshes the sandboxed preview and enables submission", async () => {
  const saved = platformerGame({ artifactReady: false });
  const built = { ...saved, artifactVersion: 2, artifactReady: true };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
    .mockResolvedValueOnce(new Response(JSON.stringify(built)));
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={platformerGame()} />);

  fireEvent.click(screen.getByRole("button", { name: "Lưu trò chơi đi cảnh" }));
  await screen.findByRole("button", { name: "Tạo bản chơi thử" });
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Tạo bản chơi thử" }));
  const preview = await screen.findByTitle("Chơi thử trò chơi");
  expect(preview).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=2",
  );
  expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    sourceType: "PLATFORMER",
    canvas: { width: 640, height: 480 },
    backgroundColor: "#111827",
    player: { x: 24, y: 0, color: "#2563eb" },
    goal: { x: 300, y: 416, color: "#16a34a" },
    platforms: [{ x: 0, y: 440, width: 640, height: 40, color: "#6b7280" }],
  });
});

test("workspace disables submission after reloading a persisted unready artifact", () => {
  const reloaded = { ...codeGame(), artifactReady: false } as GameSummary;
  render(<GameWorkspace initialGame={reloaded} />);

  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
});

test("code editor preserves edits after a failed source save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Source could not be saved" }), {
        status: 503,
      }),
    ),
  );
  render(<GameWorkspace initialGame={codeGame()} />);

  fireEvent.change(screen.getByLabelText("HTML"), {
    target: { value: "<h1>Edited quest</h1>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu mã nguồn" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
  expect(screen.getByLabelText("HTML")).toHaveValue("<h1>Edited quest</h1>");
});

test("code build refreshes the sandboxed preview and enables submission of its compiled revision", async () => {
  const saved = codeGame({
    artifactReady: false,
    projectData: {
      sourceType: "CODE",
      html: "<h1>Edited quest</h1>",
      css: "h1 { color: tomato; }",
      javascript: "window.edited = true;",
    },
  });
  const built = { ...saved, artifactVersion: 2, artifactReady: true };
  const submitted = { ...built, reviewState: "PENDING" as const };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
    .mockResolvedValueOnce(new Response(JSON.stringify(built)))
    .mockResolvedValueOnce(new Response(JSON.stringify(submitted)));
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={codeGame()} />);

  expect(screen.getByTitle("Chơi thử trò chơi")).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=1",
  );
  fireEvent.change(screen.getByLabelText("HTML"), {
    target: { value: "<h1>Edited quest</h1>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu mã nguồn" }));
  await screen.findByRole("button", { name: "Tạo bản chơi thử" });
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Tạo bản chơi thử" }));
  const preview = await screen.findByTitle("Chơi thử trò chơi");
  expect(preview).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=2",
  );
  expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Chờ duyệt");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "http://localhost:3001/games/game-1/project",
    "http://localhost:3001/games/game-1/build",
    "http://localhost:3001/games/game-1/submit",
  ]);
});

test("profile saves Vietnamese form fields and confirms success", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ displayName: "Tác giả", bio: "Xin chào" })),
    );
  vi.stubGlobal("fetch", fetch);
  render(<ProfileForm profile={null} />);
  fireEvent.change(screen.getByLabelText("Tên hiển thị"), {
    target: { value: "Tác giả" },
  });
  fireEvent.change(screen.getByLabelText("Giới thiệu"), {
    target: { value: "Xin chào" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu hồ sơ.");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    displayName: "Tác giả",
    bio: "Xin chào",
  });
});

test("creation sends explicit viewport dimensions and defaults to 16 by 9", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(codeGame())));
  vi.stubGlobal("fetch", fetch);
  render(<GameForm />);
  expect(screen.getByLabelText("Chiều rộng hiển thị")).toHaveValue(16);
  expect(screen.getByLabelText("Chiều cao hiển thị")).toHaveValue(9);
  fireEvent.change(screen.getByLabelText("Tên trò chơi"), {
    target: { value: "Game mới" },
  });
  fireEvent.change(screen.getByLabelText("Đường dẫn"), {
    target: { value: "game-moi" },
  });
  fireEvent.change(screen.getByLabelText("Chiều rộng hiển thị"), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText("Chiều cao hiển thị"), {
    target: { value: "3" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Tạo bản nháp" }).closest("form")!,
  );
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    viewportWidth: 4,
    viewportHeight: 3,
  });
});

test.each([
  ["/api/", "/api"],
  ["https://public.example/api/", "https://public.example/api"],
])("workspace cover upload uses %s and replaces owner preview and review state", async (configured, base) => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", configured);
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify(
        codeGame({
          coverVersion: 1,
          coverContentType: "image/png",
          reviewState: "PENDING",
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={codeGame()} />);
  const panel = screen.getByRole("region", { name: "Ảnh bìa và thông tin" });
  const file = new File(["cover"], "cover.png", { type: "image/png" });
  const input = within(panel).getByLabelText("Ảnh bìa trò chơi");
  expect(input).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp");
  fireEvent.change(input, { target: { files: [file] } });
  // fireEvent sets files but cannot populate a native FileList for constraint validation.
  fireEvent.submit(
    within(panel)
      .getByRole("button", { name: "Tải ảnh bìa lên" })
      .closest("form")!,
  );
  expect(
    await screen.findByRole("img", { name: "Ảnh bìa Code quest" }),
  ).toHaveAttribute("src", `${base}/games/game-1/cover/1`);
  expect(fetch).toHaveBeenCalledWith(
    `${base}/games/game-1/cover`,
    expect.objectContaining({ method: "POST", credentials: "include", body: expect.any(FormData) }),
  );
  expect(fetch.mock.calls[0][1].body.get("cover")).toBe(file);
  expect(screen.getByRole("status")).toHaveTextContent("Chờ duyệt");
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
});

test.each([
  [0, "Không thể tải ảnh bìa. Vui lòng thử lại."],
  [400, "Ảnh bìa không hợp lệ. Chọn một ảnh JPG, PNG hoặc WebP."],
  [403, "Bạn không có quyền thay đổi ảnh bìa trò chơi này."],
  [413, "Ảnh bìa quá lớn. Chọn ảnh không quá 5 MiB."],
  [503, "Dịch vụ lưu ảnh bìa tạm thời không khả dụng. Vui lòng thử lại sau."],
  [500, "Không thể tải ảnh bìa. Vui lòng thử lại."],
] as const)(
  "cover upload %s failure retains existing preview and enables retry",
  async (failure, expected) => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api");
    vi.stubGlobal(
      "fetch",
      failure === 0
        ? vi.fn().mockRejectedValue(new TypeError("offline"))
        : vi
            .fn()
            .mockResolvedValue(
              new Response(
                JSON.stringify({ message: "Email already registered" }),
                { status: failure },
              ),
            ),
    );
    render(
      <GameWorkspace
        initialGame={codeGame({
          coverVersion: 2,
          coverContentType: "image/png",
        })}
      />,
    );
    fireEvent.change(screen.getByLabelText("Ảnh bìa trò chơi"), {
      target: {
        files: [new File(["cover"], "new.png", { type: "image/png" })],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Tải ảnh bìa lên" }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(
      screen.getByRole("button", { name: "Tải ảnh bìa lên" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("img", { name: "Ảnh bìa Code quest" }),
    ).toHaveAttribute("src", "/api/games/game-1/cover/2");
  },
);

test("display settings patch dimensions and update the shared game state", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify(
        codeGame({
          viewportWidth: 4,
          viewportHeight: 3,
          reviewState: "PENDING",
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={codeGame()} />);
  const panel = screen.getByRole("region", { name: "Cài đặt hiển thị" });
  fireEvent.change(within(panel).getByLabelText("Chiều rộng hiển thị"), {
    target: { value: "4" },
  });
  fireEvent.change(within(panel).getByLabelText("Chiều cao hiển thị"), {
    target: { value: "3" },
  });
  fireEvent.submit(
    within(panel)
      .getByRole("button", { name: "Lưu hiển thị" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Lưu hiển thị" })).toBeEnabled(),
  );
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:3001/games/game-1",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ viewportWidth: 4, viewportHeight: 3 }),
    }),
  );
  expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
});

test("display settings reject invalid dimensions and retain values after an API error", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ message: "Không thể lưu" }), {
      status: 503,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={codeGame()} />);
  const width = screen.getByLabelText("Chiều rộng hiển thị");
  const form = screen
    .getByRole("button", { name: "Lưu hiển thị" })
    .closest("form")!;
  fireEvent.change(width, { target: { value: "4097" } });
  fireEvent.submit(form);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Kích thước phải là số nguyên từ 1 đến 4096.",
  );
  fireEvent.change(width, { target: { value: "4" } });
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể lưu hiển thị. Vui lòng thử lại.",
  );
  expect(width).toHaveValue(4);
  expect(screen.getByRole("button", { name: "Lưu hiển thị" })).toBeEnabled();
});

test("moderation explains a missing preview and updates pending count after approval", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  render(<ModerationQueue initialGames={[{ ...moderationGame("game-1", "Review me"), artifactReady: false }]} />);
  expect(screen.getByText("1 trò chơi chờ duyệt")).toBeVisible();
  expect(screen.getByText("Bản chơi thử chưa sẵn sàng.")).not.toBeVisible();
  expect(screen.getByText("7/9/2026, 09:00 UTC")).toHaveAttribute("datetime", "2026-09-07T09:00:00.000Z");
  fireEvent.click(screen.getByText("Kiểm tra bản gửi"));
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  await screen.findByText("Đã duyệt trò chơi.");
  expect(screen.getByText("0 trò chơi chờ duyệt")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Đã xử lý hết hàng đợi" })).toBeVisible();
});


test("moderation opens a compact submission for review without losing its preview or rejection note", () => {
  render(<ModerationQueue initialGames={[moderationGame("game-1", "Review me")]} />);
  const preview = screen.getByTitle("Chơi thử trò chơi");
  expect(preview).not.toBeVisible();
  const disclosure = screen.getByText("Kiểm tra bản gửi");
  fireEvent.click(disclosure);
  expect(preview).toBeVisible();
  fireEvent.change(screen.getByLabelText("Lý do từ chối"), { target: { value: "Please fix the opening." } });
  fireEvent.click(disclosure);
  expect(preview).not.toBeVisible();
  fireEvent.click(disclosure);
  expect(screen.getByTitle("Chơi thử trò chơi")).toBe(preview);
  expect(screen.getByLabelText("Lý do từ chối")).toHaveValue("Please fix the opening.");
  expect(preview).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
});
