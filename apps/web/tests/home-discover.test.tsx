import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Home from "../app/page";
import DiscoverPage from "../app/discover/page";
import { ApiError, api } from "../lib/api-client";

vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, api: { get: vi.fn() } };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const getGames = vi.mocked(api.get);

afterEach(() => {
  getGames.mockReset();
});

test.each(["home", "discover"])("uses contextual game headings on %s", async (page) => {
  getGames.mockResolvedValue({ games: [{
    slug: "tiny-quest", title: "Tiny Quest", description: "Demo", developer: { displayName: "Minh" },
    artifactVersion: 1, artifactReady: true, coverVersion: 0, coverContentType: null,
    viewportWidth: 16, viewportHeight: 9, createdAt: "2026-09-07T07:00:00Z",
  }], nextCursor: null });
  render(page === "home" ? await Home() : await DiscoverPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { level: page === "home" ? 3 : 2, name: "Tiny Quest" })).toBeVisible();
});

test("puts creators first with four game-making methods and a three-step process", async () => {
  getGames.mockResolvedValue({ games: [], nextCursor: null });

  render(await Home());

  expect(screen.getByRole("link", { name: "Mở Xưởng sáng tạo" })).toHaveAttribute(
    "href",
    "/studio",
  );
  expect(screen.getByRole("link", { name: "Khám phá trò chơi" })).toHaveAttribute(
    "href",
    "/discover",
  );
  for (const method of ["Tệp nén HTML5", "Lập trình", "Truyện và câu đố", "Vượt chướng ngại vật"]) {
    expect(screen.getByText(method)).toBeVisible();
  }
  for (const step of ["1. Tạo trò chơi", "2. Xem trước", "3. Gửi duyệt"]) {
    expect(screen.getByText(step)).toBeVisible();
  }
  expect(getGames).toHaveBeenCalledWith("/discover?limit=4");
});

test("retains creator sections when Home featured games cannot load", async () => {
  getGames.mockRejectedValue(new ApiError(503, "unavailable"));

  render(await Home());

  expect(screen.getByText("Tệp nén HTML5")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Không thể tải trò chơi lúc này");
  expect(screen.getByRole("link", { name: "Thử tải lại" })).toHaveAttribute("href", "/");
});

test("renders Vietnamese Discover search and empty copy", async () => {
  getGames.mockResolvedValue({ games: [], nextCursor: null });

  render(await DiscoverPage({ searchParams: Promise.resolve({ query: "none" }) }));

  expect(screen.getByRole("heading", { name: "Khám phá trò chơi" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Tìm kiếm trò chơi" })).toHaveValue("none");
  expect(screen.getByRole("button", { name: "Tìm kiếm" })).toBeVisible();
  expect(screen.getByText("Chưa có trò chơi phù hợp.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Xem tất cả trò chơi" })).toHaveAttribute(
    "href",
    "/discover",
  );
});

test("renders Vietnamese recovery copy when Discover fails", async () => {
  getGames.mockRejectedValue(new ApiError(400, "invalid"));

  render(await DiscoverPage({ searchParams: Promise.resolve({ query: "bad" }) }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Từ khóa tìm kiếm không hợp lệ. Hãy thử lại.",
  );
  expect(screen.getByRole("link", { name: "Thử lại" })).toHaveAttribute(
    "href",
    "/discover?query=bad",
  );
});


test("keeps the home concept and gives an empty community a real next action", async () => {
  getGames.mockResolvedValue({ games: [], nextCursor: null });
  render(await Home());
  expect(screen.getByText("NƠI ƯƠM MẦM NHỮNG TRÒ CHƠI")).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: "Mỗi trò chơi lớn đều bắt đầu từ một ý tưởng nhỏ." })).toBeVisible();
  expect(screen.getByRole("link", { name: "Tạo tài khoản" })).toHaveAttribute("href", "/register");
  expect(screen.getByRole("heading", { name: "Chưa có trò chơi công khai" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps the search and opaque cursor when moving to the next catalog page", async () => {
  getGames.mockResolvedValue({ games: [{
    slug: "tiny-quest", title: "Tiny Quest", description: "Demo", developer: { displayName: "Minh" },
    artifactVersion: 1, artifactReady: true, coverVersion: 0, coverContentType: null,
    viewportWidth: 16, viewportHeight: 9, createdAt: "2026-09-07T07:00:00Z",
  }], nextCursor: "opaque/+ next" });
  render(await DiscoverPage({ searchParams: Promise.resolve({ query: "tiny & quest", cursor: "previous" }) }));
  expect(screen.getByText("1 trò chơi trong trang này")).toBeVisible();
  expect(screen.getByText("Kết quả cho “tiny & quest”")).toBeVisible();
  const next = screen.getByRole("link", { name: "Trang tiếp theo" });
  const url = new URL(next.getAttribute("href")!, "https://example.test");
  expect(url.searchParams.get("query")).toBe("tiny & quest");
  expect(url.searchParams.get("cursor")).toBe("opaque/+ next");
});
