import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEngagement } from "../components/game-engagement";
import { CommunityComments } from "../components/community-comments";
import { GameAnalyticsPanel } from "../components/game-analytics";

const stats = { totalPlays: 0, uniquePlayers: 0, averagePlaySeconds: null, ratingAverage: null, ratingCount: 0, ratingDistribution: [1,2,3,4,5].map(stars => ({ stars, count: 0 })), commentCount: 0, highScore: null, scoresEnabled: false };
const viewer = { id: "me", role: "USER" as const };
const comment = { id: "c1", body: "<script>bonjour</script>", author: { id: "other", displayName: "Linh" }, rating: 4, createdAt: "2026-09-16T10:00:00Z" };
const reply = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("public engagement", () => {
  it("shows genuine zero states and prompts guests before rating or commenting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/auth/me") ? reply({},401) : reply(url.endsWith("/stats") ? stats : { items: [], total: 0 })));
    render(<GameEngagement slug="demo" title="Demo" />);
    expect(await screen.findByText("Chưa có đánh giá")).toBeInTheDocument();
    expect(screen.getByText("Chưa có lượt chơi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "5 sao" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Đăng nhập/ }).length).toBeGreaterThan(0);
  });
  it("upserts and removes the viewer rating, then refreshes the real aggregate", async () => {
    let rating: number | null = null;
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/me")) return reply(viewer);
      if (url.endsWith("/me")) return reply({ rating });
      if (url.endsWith("/rating")) { rating = init.method === "DELETE" ? null : JSON.parse(init.body as string).rating; return reply({},204); }
      if (url.endsWith("/stats")) return reply({ ...stats, ratingAverage: rating, ratingCount: rating ? 1 : 0 });
      return reply({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<GameEngagement slug="demo" title="Demo" />);
    fireEvent.click(await screen.findByRole("button", { name: "5 sao" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "5 sao" })).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText("5,0 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa đánh giá của tôi" }));
    expect(await screen.findByText("Chưa có đánh giá")).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url, init]) => url.endsWith("/rating") && init.method === "PUT" && init.body === '{"rating":5}')).toBe(true);
  });
});

describe("community", () => {
  it("keeps comments plain text, paginates, and only exposes own delete for users", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url.includes("offset=20") ? { items: [{ ...comment, id: "c2", author: { ...viewer, displayName: "Tôi" } }], total: 21 } : { items: [comment], total: 21 })));
    render(<CommunityComments endpoint="/engagement/games/demo/comments" viewer={viewer} canCreate />);
    expect(await screen.findByText(comment.body)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa bình luận" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(await screen.findByRole("button", { name: "Xóa bình luận" })).toBeInTheDocument();
    expect(screen.getByText("Trang 2 / 2")).toBeInTheDocument();
  });
  it("preserves draft on rate limit and allows moderator deletion through private scope", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => init.method === "POST" ? reply({},429) : init.method === "DELETE" ? reply({},204) : reply({ items: [comment], total: 1 }));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<CommunityComments endpoint="/engagement/games/demo/comments" viewer={viewer} canCreate />);
    fireEvent.change(screen.getByLabelText("Bình luận của bạn"), { target: { value: "Nhận xét mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/30 giây/);
    expect(screen.getByLabelText("Bình luận của bạn")).toHaveValue("Nhận xét mới");
    unmount();
    render(<CommunityComments endpoint="/games/private-id/community-comments" viewer={{ id: "mod", role: "MODERATOR" }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bình luận" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === "http://localhost:3001/games/private-id/community-comments/c1" && init.method === "DELETE")).toBe(true));
  });
});

it("renders analytics daily values and persists the score setting", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => init.method === "PATCH" ? reply({ scoresEnabled: true }) : reply({ items: [], total: 0 })));
  render(<GameAnalyticsPanel initial={{ game: { id: "g1", title: "Demo", slug: "demo", reviewState: "APPROVED" }, stats, dailyPlays: [{ date: "2026-09-15", plays: 0 }, { date: "2026-09-16", plays: 3 }], trackingStartedAt: null }} viewer={viewer} />);
  fireEvent.click(screen.getByText("Xem số liệu từng ngày"));
  const table = screen.getByRole("table", { name: "Lượt chơi theo ngày" });
  expect(within(table).getByText("3")).toBeInTheDocument();
  expect(screen.getByText("Chưa tích hợp thanh toán")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Nhận điểm từ trò chơi" }));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
  expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu");
});

it("publishes a trimmed comment and refreshes the list after own deletion", async () => {
  let items: typeof comment[] = [];
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "POST") { items = [{ ...comment, body: JSON.parse(init.body as string).body, author: { id: "me", displayName: "Tôi" } }]; return reply(items[0],201); }
    if (init.method === "DELETE") { items = []; return reply({},204); }
    return reply({ items, total: items.length });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CommunityComments endpoint="/engagement/games/demo/comments" viewer={viewer} canCreate />);
  fireEvent.change(screen.getByLabelText("Bình luận của bạn"), { target: { value: "  Rất vui!  " } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
  expect(await screen.findByText("Rất vui!")).toBeInTheDocument();
  expect(screen.getByLabelText("Bình luận của bạn")).toHaveValue("");
  fireEvent.click(await screen.findByRole("button", { name: "Xóa bình luận" }));
  expect(await screen.findByText("Chưa có bình luận nào.")).toBeInTheDocument();
  expect(fetcher.mock.calls.some(([, init]) => init.body === '{"body":"Rất vui!"}')).toBe(true);
});

it("copies the actual game URL when native share is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/auth/me") ? reply({},401) : reply(url.endsWith("/stats") ? stats : { items: [], total: 0 })));
  render(<GameEngagement slug="demo" title="Demo" />);
  fireEvent.click(screen.getByRole("button", { name: "Chia sẻ trò chơi" }));
  expect(await screen.findByText("Đã sao chép liên kết.")).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(window.location.href);
});

it("refreshes activity after a confirmed play in this game", async () => {
  let plays = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/auth/me") ? reply({},401) : reply(url.endsWith("/stats") ? { ...stats, totalPlays: plays, uniquePlayers: plays, averagePlaySeconds: plays ? 12 : null } : { items: [], total: 0 })));
  render(<GameEngagement slug="demo" title="Demo" />);
  await screen.findByText("Chưa có lượt chơi");
  plays = 1;
  fireEvent(window, new CustomEvent("tfg:engagement-change", { detail: { slug: "demo" } }));
  expect(await screen.findByText("12 giây")).toBeInTheDocument();
});
