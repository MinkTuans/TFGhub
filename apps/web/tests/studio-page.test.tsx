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
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/games\/engine-projects$/), expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Trò chơi chưa có tên" }), credentials: "include" }));
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
  expect(screen.getByText("Chào mừng bạn đến với Xưởng sáng tạo.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Tạo trò chơi" })).toHaveAttribute("href", "/studio/games/new");
  const summary = screen.getByRole("region", { name: "Thống kê trò chơi" });
  ["Bản nháp", "Chờ duyệt", "Đã duyệt", "Bị từ chối"].forEach((label, index) => {
    const term = within(summary).getByText(label);
    expect(term.tagName).toBe("DT");
    expect(term.nextElementSibling).toHaveTextContent(String(counts[index]));
  });
});

test("owner search combines review filters, sorts results and resets an empty match without changing totals", async () => {
  vi.mocked(privateGet).mockResolvedValue([
    { id: "one", slug: "one", title: "Zebra", description: "Forest adventure", reviewState: "DRAFT", visibility: "DRAFT", updatedAt: "2026-09-10", coverVersion: 0 },
    { id: "two", slug: "two", title: "Alpha", description: "Forest puzzle", reviewState: "APPROVED", visibility: "PUBLIC", updatedAt: "2026-09-11", coverVersion: 0 },
  ]);
  render(await StudioPage());
  fireEvent.change(screen.getByLabelText("Tìm trò chơi của bạn"), { target: { value: " FOREST " } });
  expect(screen.getByRole("status")).toHaveTextContent("2 / 2 trò chơi");
  fireEvent.change(screen.getByLabelText("Trạng thái duyệt"), { target: { value: "DRAFT" } });
  expect(screen.getByRole("link", { name: "Zebra" })).toHaveAttribute("href", "/studio/games/one");
  expect(screen.queryByRole("link", { name: "Alpha" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tìm trò chơi của bạn"), { target: { value: "missing" } });
  expect(screen.getByRole("heading", { name: "Không có trò chơi phù hợp" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
  fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "title" } });
  expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual(["Alpha", "Zebra"]);
  expect(screen.getByRole("status")).toHaveTextContent("2 / 2 trò chơi");
  expect(within(screen.getByRole("region", { name: "Thống kê trò chơi" })).getByText("Đã duyệt").nextElementSibling).toHaveTextContent("1");
});

test("Studio sends only card metadata across the interactive list boundary", async () => {
  vi.mocked(privateGet).mockResolvedValue([{ id: "one", reviewState: "DRAFT", projectData: { javascript: "large source" } }]);
  const page = await StudioPage();
  const section = page.props.children.find((child: { props?: { "aria-labelledby"?: string } }) => child.props?.["aria-labelledby"] === "games-heading");
  const list = section.props.children.find((child: { props?: { games?: unknown } }) => child.props?.games);
  expect(list.props.games[0]).not.toHaveProperty("projectData");
  expect(list.props.games[0]).toMatchObject({ id: "one", reviewState: "DRAFT" });
});


test("Studio navigation links creators to their game list and profile", async () => {
  vi.mocked(privateGet).mockResolvedValue([]);
  render(await StudioPage());
  const nav = screen.getByRole("navigation", { name: "Không gian sáng tạo" });
  expect(within(nav).getByRole("link", { name: "Trò chơi của bạn" })).toHaveAttribute("href", "#games-heading");
  expect(within(nav).getByRole("link", { name: "Hồ sơ của bạn" })).toHaveAttribute("href", "/profile");
});
