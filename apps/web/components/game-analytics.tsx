"use client";

import { useState } from "react";
import type { GameAnalytics } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { EngagementMetrics } from "./engagement-stats";
import { CommunityComments, type CommunityViewer } from "./community-comments";

export function GameAnalyticsPanel({ initial, viewer }: { initial: GameAnalytics; viewer: CommunityViewer }) {
  const [scoresEnabled, setScoresEnabled] = useState(initial.stats.scoresEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const peak = Math.max(1, ...initial.dailyPlays.map(day => day.plays));
  async function toggleScores() {
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await api.patch<{ scoresEnabled: boolean }>(`/games/${encodeURIComponent(initial.game.id)}/engagement-settings`, { scoresEnabled: !scoresEnabled });
      setScoresEnabled(result.scoresEnabled); setMessage("Đã lưu cài đặt điểm.");
    } catch { setError("Không thể lưu cài đặt. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <div className="analytics-sections">
    <section className="panel" aria-label="Tổng quan hoạt động"><h2>Hoạt động thực tế</h2><EngagementMetrics stats={{ ...initial.stats, scoresEnabled }} />
      <p className="hint">Lượt chơi bắt đầu khi người chơi chủ động mở bản công khai. Người chơi là ước tính theo tài khoản hoặc trình duyệt. Thời gian trung bình gồm cả lượt chơi chưa ghi nhận thời gian.</p>
      <p className="hint">{initial.trackingStartedAt ? `Lượt chơi đầu tiên được ghi nhận: ${new Date(initial.trackingStartedAt).toLocaleDateString("vi-VN", { timeZone: "UTC" })}.` : "Chưa ghi nhận lượt chơi. Không có dữ liệu hoạt động trước khi tính năng được triển khai."}</p>
    </section>
    <section className="panel"><div className="engagement-heading"><h2>Lượt chơi trong 30 ngày</h2><span className="badge">Theo ngày UTC</span></div>
      <div className="plays-chart" role="img" aria-label="Biểu đồ lượt chơi; số liệu chi tiết trong bảng bên dưới">{initial.dailyPlays.map(day => <div key={day.date} className="plays-chart__column"><div style={{ height: `${day.plays / peak * 100}%` }} title={`${day.date}: ${day.plays} lượt chơi`} /></div>)}</div>
      {initial.dailyPlays.length > 0 && <div className="engagement-heading hint"><span>{initial.dailyPlays[0].date}</span><span>{initial.dailyPlays[initial.dailyPlays.length - 1].date}</span></div>}
      <details className="analytics-data"><summary>Xem số liệu từng ngày</summary><div className="analytics-table"><table aria-label="Lượt chơi theo ngày"><thead><tr><th scope="col">Ngày (UTC)</th><th scope="col">Lượt chơi</th></tr></thead><tbody>{initial.dailyPlays.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.plays.toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="panel"><h2>Điểm từ trò chơi</h2><label className="score-setting"><input type="checkbox" checked={scoresEnabled} disabled={busy} onChange={toggleScores} />Nhận điểm từ trò chơi</label><p className="hint">Game có thể gửi điểm bằng <code>{'window.parent.postMessage({ type: "tfg:score", score: 100 }, "*")'}</code>. Chỉ nhận số nguyên không âm tối đa 2.147.483.647 trong một lượt chơi công khai hợp lệ. Mỗi lượt giữ điểm cao nhất.</p><p className="hint">Điểm do trình duyệt gửi, chưa xác minh chống gian lận. Chưa có bảng xếp hạng.</p>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section>
    <section className="panel"><h2>Thanh toán</h2><p>Chưa tích hợp thanh toán</p></section>
    <CommunityComments endpoint={`/games/${encodeURIComponent(initial.game.id)}/community-comments`} viewer={viewer} />
  </div>;
}
