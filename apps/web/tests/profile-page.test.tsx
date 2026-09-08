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
  vi.mocked(privateGet).mockResolvedValue({ displayName, bio: "Nhà phát triển game" });
  render(await ProfilePage());
  expect(screen.getByRole("img", { name: "Ảnh đại diện" })).toHaveTextContent(initials);
  expect(screen.getByLabelText("Tên hiển thị")).toHaveValue(displayName);
});

test("shows a TFG avatar when the creator has no profile yet", async () => {
  vi.mocked(privateGet).mockRejectedValue(new ApiError(404, "No profile"));
  render(await ProfilePage());
  expect(screen.getByRole("img", { name: "Ảnh đại diện" })).toHaveTextContent("TFG");
  expect(screen.getByLabelText("Tên hiển thị")).toHaveValue("");
});
