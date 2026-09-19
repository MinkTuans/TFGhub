import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StudioPage from "../app/studio/page";
import { privateGet } from "../lib/session";
import NewGamePage from "../app/studio/games/new/page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

vi.mock("../lib/session", () => ({ privateGet: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

test("one Create click posts a named pixel template once and replaces the route with its Studio workspace", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(await NewGamePage());
  fireEvent.click(screen.getByRole("button", { name: "Tạo game Pixel" }));
  expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  const button = screen.getByRole("button", { name: "Tạo bản nháp" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/games\/engine-projects$/), expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Đảo của tôi", template: "PIXEL_ADVENTURE" }), credentials: "include" }));
  await act(async () => finish(new Response(JSON.stringify({ game: { id: "returned-game" }, project: { status: "SUPPORTED" } }))));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/studio/games/returned-game"));
  expect(button).toBeDisabled();
});

test("a failed draft creation shows an error and lets the creator retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
  render(await NewGamePage());
  fireEvent.click(screen.getByRole("button", { name: "Tạo game Pixel" }));
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

test("creator chooses a name and blank template explicitly", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ game: { id: "blank" } })));
  vi.stubGlobal("fetch", fetch);
  render(await NewGamePage());
  fireEvent.click(screen.getByRole("button", { name: "Tạo game Pixel" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tên trò chơi" }), { target: { value: "Vườn của An" } });
  fireEvent.click(screen.getByRole("radio", { name: /Dự án 2D trống/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/studio/games/blank"));
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/games\/engine-projects$/), expect.objectContaining({ body: JSON.stringify({ title: "Vườn của An", template: "BLANK" }) }));
});

test("creation starts with two choices and opens the existing upload form with legacy sources retained", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "upload-game" })));
  vi.stubGlobal("fetch", fetch);
  render(await NewGamePage());
  expect(screen.queryByRole("button", { name: "Tạo bản nháp" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tải game HTML5/ZIP" }));
  expect(screen.getByLabelText("Cách tạo trò chơi")).toHaveValue("UPLOAD");
  for (const name of ["Lập trình", "Cốt truyện", "Đi cảnh"]) {
    expect(screen.getByRole("option", { name })).toBeInTheDocument();
  }
  fireEvent.change(screen.getByLabelText("Tên trò chơi"), { target: { value: "Game của tôi" } });
  fireEvent.change(screen.getByLabelText("Đường dẫn"), { target: { value: "game-cua-toi" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/studio"));
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/games$/), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ title: "Game của tôi", slug: "game-cua-toi", description: "", accessMode: "GUEST_ALLOWED", sourceType: "UPLOAD", viewportWidth: 16, viewportHeight: 9 }),
  }));
});

test("creation presents web upload before the unchanged Pixel entry", async () => {
  render(await NewGamePage());
  expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
    "Tải game HTML5/ZIP",
    "Tạo game Pixel",
  ]);
});

test("Pixel choice offers only the recommended playable template and blank scene", async () => {
  render(await NewGamePage());
  fireEvent.click(screen.getByRole("button", { name: "Tạo game Pixel" }));
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.getByRole("radio", { name: /Khuyên dùng/ })).toBeChecked();
  expect(screen.getByRole("radio", { name: /Dự án 2D trống/ })).not.toBeChecked();
  expect(screen.queryByLabelText("Cách tạo trò chơi")).not.toBeInTheDocument();
});
