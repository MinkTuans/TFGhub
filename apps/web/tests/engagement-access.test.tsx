import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AnalyticsPage from "../app/studio/games/[id]/analytics/page";
import CommentsPage from "../app/moderation/games/[id]/comments/page";
import { optionalSession, privateGet } from "../lib/session";
import { ApiError } from "../lib/api-client";
vi.mock("../lib/session", () => ({ optionalSession: vi.fn(), privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
test("guests cannot request private analytics", async () => {
  vi.mocked(optionalSession).mockResolvedValue(null);
  await expect(AnalyticsPage({ params: Promise.resolve({ id: "private" }) })).rejects.toThrow("redirect:/login");
  expect(privateGet).not.toHaveBeenCalled();
});
test.each(["USER", "MODERATOR"] as const)("%s does not gain analytics access when API denies ownership", async role => {
  vi.mocked(optionalSession).mockResolvedValue({ id: "other", role, email: "private@example.test" });
  vi.mocked(privateGet).mockRejectedValue(new ApiError(403, "denied"));
  render(await AnalyticsPage({ params: Promise.resolve({ id: "private" }) }));
  expect(screen.getByRole("heading", { name: "Thống kê riêng tư" })).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
test("ordinary users cannot open the moderator comments page", async () => {
  vi.mocked(optionalSession).mockResolvedValue({ id: "other", role: "USER", email: "private@example.test" });
  await expect(CommentsPage({ params: Promise.resolve({ id: "private" }) })).rejects.toThrow("redirect:/");
});
