import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ProfilePage from "../app/profile/page";
import { ApiError } from "../lib/api-client";
import { privateGet } from "../lib/session";

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => vi.resetAllMocks());

test.each([
  [" Nguyễn  Minh ", "NM"],
  ["Đặng", "Đ"],
])("shows initials for profile %s", async (displayName, initials) => {
  vi.mocked(privateGet).mockImplementation(async (path) => path === "/games/mine" ? [] : { displayName, bio: "Nhà phát triển game" });
  render(await ProfilePage());
  expect(screen.getByRole("img", { name: "Ảnh đại diện" })).toHaveTextContent(initials);
  expect(screen.getByLabelText("Tên hiển thị")).toHaveValue(displayName);
});

test("shows a TFG avatar when the creator has no profile yet", async () => {
  vi.mocked(privateGet).mockImplementation(async (path) => { if (path === "/games/mine") return []; throw new ApiError(404, "No profile"); });
  render(await ProfilePage());
  expect(screen.getByRole("img", { name: "Ảnh đại diện" })).toHaveTextContent("TFG");
  expect(screen.getByLabelText("Tên hiển thị")).toHaveValue("");
});


test("shows owned games with management links and an honest empty state", async () => {
  vi.mocked(privateGet).mockImplementation(async (path) => path === "/games/mine" ? [] : { displayName: "Minh", bio: "Small games" });
  render(await ProfilePage());
  expect(screen.getByRole("heading", { name: "Game của bạn" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Chưa có game nào" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Tạo game đầu tiên" })).toHaveAttribute("href", "/studio/games/new");
});

test("an owned draft links to management rather than a public game route", async () => {
  vi.mocked(privateGet).mockImplementation(async (path) => path === "/games/mine" ? [{
    id: "draft-1", slug: "private-draft", title: "Private draft", description: "My idea",
    coverVersion: 0, coverContentType: null,
  }] : { displayName: "Minh", bio: "Small games" });
  render(await ProfilePage());
  expect(screen.getByRole("link", { name: "Private draft" })).toHaveAttribute("href", "/studio/games/draft-1");
  expect(screen.queryByRole("link", { name: "Chơi Private draft" })).not.toBeInTheDocument();
});
