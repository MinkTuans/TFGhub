import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StudioPage from "../app/studio/page";
import { privateGet } from "../lib/session";

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test.each([
  { states: [], counts: [0, 0, 0, 0] },
  { states: ["DRAFT", "DRAFT", "PENDING", "APPROVED", "REJECTED"], counts: [2, 1, 1, 1] },
  { states: ["APPROVED"], counts: [0, 0, 1, 0] },
])("Studio greets creators and counts every review state: $states", async ({ states, counts }) => {
  vi.mocked(privateGet).mockResolvedValue(states.map((reviewState, index) => ({
    id: `game-${index}`, slug: `game-${index}`, title: `Game ${index}`, description: "",
    visibility: "PUBLIC", accessMode: "GUEST_ALLOWED", moderationState: "CLEAR",
    sourceType: "CODE", reviewState, projectData: null,
    artifactVersion: 1, artifactReady: true, coverVersion: 0, coverContentType: null,
    viewportWidth: 16, viewportHeight: 9, reviewNote: null, submittedAt: null,
    reviewedAt: null, createdAt: "2026-09-07T07:00:00Z", updatedAt: "2026-09-07T07:00:00Z",
  })));
  render(await StudioPage());
  expect(screen.getByText("Chào mừng bạn đến với Studio.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Tạo game" })).toHaveAttribute("href", "/studio/games/new");
  const summary = screen.getByRole("region", { name: "Thống kê game" });
  ["Bản nháp", "Chờ duyệt", "Đã duyệt", "Bị từ chối"].forEach((label, index) => {
    const term = within(summary).getByText(label);
    expect(term.tagName).toBe("DT");
    expect(term.nextElementSibling).toHaveTextContent(String(counts[index]));
  });
});
