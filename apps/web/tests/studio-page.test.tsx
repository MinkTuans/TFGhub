import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StudioPage from "../app/studio/page";
import { privateGet } from "../lib/session";
import NewGamePage from "../app/studio/games/new/page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

test("one Create click posts a blank draft once and replaces the route with its Studio workspace", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(await NewGamePage());
  expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  const button = screen.getByRole("button", { name: "Tạo bản nháp" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/games\/engine-projects$/), expect.objectContaining({ method: "POST", body: "{}", credentials: "include" }));
  await act(async () => finish(new Response(JSON.stringify({ game: { id: "returned-game" }, project: { status: "SUPPORTED" } }))));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/studio/games/returned-game"));
  expect(button).toBeDisabled();
});

test("a failed draft creation shows an error and lets the creator retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
  render(await NewGamePage());
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Tạo bản nháp" })).toBeEnabled();
  expect(replace).not.toHaveBeenCalled();
});

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
