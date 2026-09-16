import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GamePlayer } from "../components/game-player";
import GamePage from "../app/games/[slug]/page";
import { api, ApiError } from "../lib/api-client";

vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, api: { get: vi.fn() } };
});

const props = { title: "Tiny Quest", src: "/api/play/tiny-quest/", viewportWidth: 1600, viewportHeight: 900 };
const game = { slug: "tiny-quest", title: "Tiny Quest", description: "A tiny adventure", developer: { displayName: "Minh" }, artifactReady: true, artifactVersion: 1, coverVersion: 0, coverContentType: null, viewportWidth: 1600, viewportHeight: 900, createdAt: "2026-09-07T00:00:00Z" };
let resize: ResizeObserverCallback;
let observed: Element;
const disconnect = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe(element: Element) { observed = element; }
    disconnect = disconnect;
  });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(api.get).mockReset();
});

function changeFullscreen(element: Element | null) {
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: element });
  fireEvent(document, new Event("fullscreenchange"));
}

function resizeStage(width: number, height: number) {
  act(() => resize([{ target: observed, contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver));
}

test("keeps the signed redirect source and restricted sandbox with iframe scrolling disabled", () => {
  render(<GamePlayer {...props} />);
  const iframe = screen.getByTitle("Chơi Tiny Quest");
  expect(iframe).toHaveAttribute("src", "/api/play/tiny-quest/");
  expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
  expect(iframe).toHaveAttribute("scrolling", "no");
  expect(screen.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
});

test("requests fullscreen on the entire player and follows browser events without replacing or reloading the iframe", async () => {
  render(<GamePlayer {...props} />);
  const player = screen.getByRole("region", { name: "Chơi Tiny Quest" });
  const iframe = screen.getByTitle("Chơi Tiny Quest");
  const request = vi.fn().mockResolvedValue(undefined);
  const exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(player, "requestFullscreen", { configurable: true, value: request });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  fireEvent.click(screen.getByRole("button", { name: "Mở toàn màn hình" }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(request.mock.contexts[0]).toBe(player);
  expect(screen.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
  changeFullscreen(player);
  fireEvent.click(screen.getByRole("button", { name: "Thoát toàn màn hình" }));
  await waitFor(() => expect(exit).toHaveBeenCalledOnce());
  changeFullscreen(null);
  expect(screen.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
  expect(screen.getByTitle("Chơi Tiny Quest")).toBe(iframe);
  expect(iframe).toHaveAttribute("src", props.src);
  changeFullscreen(document.body);
  expect(screen.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
});

test.each(["rejected", "synchronous", "unsupported"])("announces %s fullscreen failure while preserving play", async (failure) => {
  render(<GamePlayer {...props} />);
  const player = screen.getByRole("region", { name: "Chơi Tiny Quest" });
  const iframe = screen.getByTitle("Chơi Tiny Quest");
  Object.defineProperty(player, "requestFullscreen", { configurable: true, value: failure === "unsupported" ? undefined : vi.fn(() => {
    if (failure === "synchronous") throw new Error("denied");
    return Promise.reject(new Error("denied"));
  }) });
  fireEvent.click(screen.getByRole("button", { name: "Mở toàn màn hình" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Không thể mở toàn màn hình trên trình duyệt này.");
  expect(screen.getByTitle("Chơi Tiny Quest")).toBe(iframe);
  expect(iframe).toHaveAttribute("src", props.src);
  expect(screen.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
});

test("handles a rejected exit and clears the error after a successful retry", async () => {
  render(<GamePlayer {...props} />);
  const player = screen.getByRole("region", { name: "Chơi Tiny Quest" });
  changeFullscreen(player);
  const exit = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  fireEvent.click(screen.getByRole("button", { name: "Thoát toàn màn hình" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Không thể mở toàn màn hình");
  fireEvent.click(screen.getByRole("button", { name: "Thoát toàn màn hình" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  changeFullscreen(null);
});

test.each([
  [1600, 900, 800, 600, 800, 450],
  [1600, 900, 1200, 450, 800, 450],
  [600, 900, 800, 600, 400, 600],
  [800, 800, 700, 400, 400, 400],
  [0, -10, 800, 600, 800, 450],
])("contains a %sx%s game in a %sx%s available box", (viewportWidth, viewportHeight, width, height, expectedWidth, expectedHeight) => {
  render(<GamePlayer {...props} viewportWidth={viewportWidth} viewportHeight={viewportHeight} />);
  resizeStage(width, height);
  expect(screen.getByTitle("Chơi Tiny Quest").parentElement).toHaveStyle({ width: `${expectedWidth}px`, height: `${expectedHeight}px` });
});

test("refits on fullscreen resize and disconnects measurement on unmount", () => {
  const { unmount } = render(<GamePlayer {...props} />);
  const iframe = screen.getByTitle("Chơi Tiny Quest");
  resizeStage(800, 600);
  changeFullscreen(screen.getByRole("region", { name: "Chơi Tiny Quest" }));
  resizeStage(1920, 1000);
  expect(iframe.parentElement).toHaveStyle({ height: "1000px" });
  expect(Number.parseFloat(iframe.parentElement!.style.width)).toBeCloseTo(1777.7778);
  expect(screen.getByTitle("Chơi Tiny Quest")).toBe(iframe);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

test("renders SSR game details, two ads and related games with the existing public play URL", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://tfg.example/api");
  vi.mocked(api.get).mockImplementation(async (path) => path.startsWith("/games/") ? game : { games: [game, { ...game, slug: "sky", title: "Sky" }], nextCursor: null });
  render(await GamePage({ params: Promise.resolve({ slug: "tiny-quest" }) }));
  expect(screen.getByRole("heading", { level: 1, name: "Tiny Quest" })).toBeVisible();
  expect(screen.getByTitle("Chơi Tiny Quest")).toHaveAttribute("src", "https://tfg.example/api/play/tiny-quest/");
  expect(screen.getAllByText("Quảng cáo")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /Sky/ })).toHaveAttribute("href", "/games/sky");
  expect(api.get).toHaveBeenCalledWith("/discover?limit=7");
  expect(screen.getByText("A tiny adventure")).toBeVisible();
});

test("keeps the SSR player available when related discovery fails", async () => {
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path.startsWith("/games/")) return game;
    throw new ApiError(503, "unavailable");
  });
  render(await GamePage({ params: Promise.resolve({ slug: "tiny-quest" }) }));
  expect(screen.getByTitle("Chơi Tiny Quest")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Game liên quan" })).not.toBeInTheDocument();
});

test("does not embed an unavailable artifact", async () => {
  vi.mocked(api.get).mockImplementation(async (path) => path.startsWith("/games/") ? { ...game, artifactReady: false } : { games: [], nextCursor: null });
  render(await GamePage({ params: Promise.resolve({ slug: "tiny-quest" }) }));
  expect(screen.queryByTitle("Chơi Tiny Quest")).not.toBeInTheDocument();
});

test("preserves the game's not-found response", async () => {
  vi.mocked(api.get).mockRejectedValue(new ApiError(404, "missing"));
  await expect(GamePage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test("propagates primary game failures", async () => {
  vi.mocked(api.get).mockRejectedValue(new ApiError(503, "game unavailable"));
  await expect(GamePage({ params: Promise.resolve({ slug: "tiny-quest" }) })).rejects.toThrow("game unavailable");
});

test("adds product information from the public summary without inventing release history", async () => {
  vi.mocked(api.get).mockImplementation(async (path) => path.startsWith("/discover") ? { games: [], nextCursor: null } : game);
  render(await GamePage({ params: Promise.resolve({ slug: game.slug }) }));
  expect(screen.getByRole("heading", { name: "Thông tin game" })).toBeVisible();
  expect(screen.getByText("Trình duyệt")).toBeVisible();
  expect(screen.getByText("Bản dựng #1")).toBeVisible();
  expect(screen.getByText("07/09/2026")).toHaveAttribute("dateTime", game.createdAt);
  expect(screen.getByTitle("Chơi Tiny Quest")).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
  expect(screen.queryByText("Lịch sử phát hành")).not.toBeInTheDocument();
});
