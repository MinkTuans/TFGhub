import Link from "next/link";
import { redirect } from "next/navigation";
import type { GameAnalytics } from "@indieforge/contracts";
import { GameAnalyticsPanel } from "../../../../../components/game-analytics";
import { optionalSession, privateGet } from "../../../../../lib/session";
import { ApiError } from "../../../../../lib/api-client";

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await optionalSession();
  if (!viewer) redirect("/login");
  let analytics: GameAnalytics;
  try { analytics = await privateGet<GameAnalytics>(`/games/${encodeURIComponent(id)}/analytics`); }
  catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return <main><h1>Thống kê riêng tư</h1><p>Bạn cần là chủ trò chơi hoặc quản trị viên để xem thống kê này.</p><Link href="/studio">Về Xưởng sáng tạo</Link></main>;
    throw error;
  }
  return <main className="analytics-page"><header className="page-heading"><Link href="/studio">← Về Xưởng sáng tạo</Link><p className="eyebrow">Dành cho nhà sáng tạo</p><h1>Thống kê · {analytics.game.title}</h1><p className="hint">Thống kê riêng tư của trò chơi.</p></header><GameAnalyticsPanel key={analytics.game.id} initial={analytics} viewer={{ id: viewer.id, role: viewer.role }} /></main>;
}
