import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Home from "../app/page";
import DiscoverPage from "../app/discover/page";
import { ApiError, api } from "../lib/api-client";

vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api-client")>();
  return { ...actual, api: { get: vi.fn() } };
});

const getGames = vi.mocked(api.get);

afterEach(() => {
  getGames.mockReset();
});

test("puts creators first with four game-making methods and a three-step process", async () => {
  getGames.mockResolvedValue({ games: [], nextCursor: null });

  render(await Home());

  expect(screen.getByRole("link", { name: "Mở Studio" })).toHaveAttribute(
    "href",
    "/studio",
  );
  expect(screen.getByRole("link", { name: "Khám phá game" })).toHaveAttribute(
    "href",
    "/discover",
  );
  for (const method of ["ZIP HTML5", "Code", "Truyện & quiz", "Platformer"]) {
    expect(screen.getByText(method)).toBeVisible();
  }
  for (const step of ["1. Tạo game", "2. Xem trước", "3. Gửi duyệt"]) {
    expect(screen.getByText(step)).toBeVisible();
  }
  expect(getGames).toHaveBeenCalledWith("/discover?limit=4");
});

test("retains creator sections when Home featured games cannot load", async () => {
  getGames.mockRejectedValue(new ApiError(503, "unavailable"));

  render(await Home());

  expect(screen.getByText("ZIP HTML5")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Game nổi bật" })).not.toBeInTheDocument();
});

test("renders Vietnamese Discover search and empty copy", async () => {
  getGames.mockResolvedValue({ games: [], nextCursor: null });

  render(await DiscoverPage({ searchParams: Promise.resolve({ query: "none" }) }));

  expect(screen.getByRole("heading", { name: "Khám phá game" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Tìm kiếm game" })).toHaveValue("none");
  expect(screen.getByRole("button", { name: "Tìm kiếm" })).toBeVisible();
  expect(screen.getByText("Chưa có game phù hợp.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Xem tất cả game" })).toHaveAttribute(
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
