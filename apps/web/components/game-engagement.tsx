"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EngagementStats, EngagementViewer } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";
import { CommunityComments, type CommunityViewer } from "./community-comments";
import { EngagementMetrics } from "./engagement-stats";

export function GameEngagement({ slug, title }: { slug: string; title: string }) {
  const base = `/engagement/games/${encodeURIComponent(slug)}`;
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [viewer, setViewer] = useState<CommunityViewer | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const refreshStats = useCallback(async () => {
    try { setStats(await api.get<EngagementStats>(`${base}/stats`)); setStatsError(""); }
    catch { setStatsError("Không thể tải thống kê lúc này."); }
  }, [base]);
  useEffect(() => {
    let alive = true;
    api.get<EngagementStats>(`${base}/stats`).then(result => { if (alive) { setStats(result); setStatsError(""); } }).catch(() => { if (alive) setStatsError("Không thể tải thống kê lúc này."); });
    const onActivity = (event: Event) => {
      if ((event as CustomEvent<{ slug: string }>).detail?.slug === slug) void refreshStats();
    };
    window.addEventListener("tfg:engagement-change", onActivity);
    return () => { alive = false; window.removeEventListener("tfg:engagement-change", onActivity); };
  }, [base, slug, refreshStats]);
  useEffect(() => {
    let alive = true;
    async function loadViewer() {
      try {
        const user = await api.get<CommunityViewer>("/auth/me");
        const own = await api.get<EngagementViewer>(`${base}/me`);
        if (alive) { setViewer(user); setRating(own.rating); }
      } catch (failure) {
        if (alive && !(failure instanceof ApiError && failure.status === 401)) setAuthError("Không thể tải tài khoản. Hãy tải lại trang để tương tác.");
      } finally { if (alive) setAuthReady(true); }
    }
    void loadViewer();
    return () => { alive = false; };
  }, [base]);
  async function rate(value: number | null) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (value === null) await api.delete(`${base}/rating`, undefined);
      else await api.put(`${base}/rating`, { rating: value });
      setRating(value); setRevision(current => current + 1);
      setNotice(value === null ? "Đã xóa đánh giá." : "Đã lưu đánh giá.");
      await refreshStats();
    } catch (failure) { setError(failure instanceof ApiError && failure.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : "Không thể lưu đánh giá. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  async function share() {
    setError(""); setNotice("");
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(window.location.href); setNotice("Đã sao chép liên kết."); }
      else setNotice(`Liên kết trò chơi: ${window.location.href}`);
    } catch (failure) { if (!(failure instanceof DOMException && failure.name === "AbortError")) setError("Chưa thể chia sẻ. Bạn có thể sao chép địa chỉ trên trình duyệt."); }
  }
  return <div className="game-engagement">
    <section className="panel" aria-label="Hoạt động trò chơi">
      <header className="engagement-heading"><div><p className="eyebrow">Từ cộng đồng</p><h2>Trải nghiệm & đánh giá</h2></div><button className="button-secondary" onClick={share}>Chia sẻ trò chơi</button></header>
      {statsError && <p role="alert">{statsError} <button className="button-secondary" onClick={refreshStats}>Tải lại thống kê</button></p>}
      {stats ? <><EngagementMetrics stats={stats} /><p className="hint">Người chơi được ước tính theo tài khoản hoặc trình duyệt. Thời gian chỉ tính khi đang chơi tích cực.</p>
        <div className="rating-distribution" aria-label="Phân bố đánh giá">{[5,4,3,2,1].map(stars => { const count = stats.ratingDistribution.find(item => item.stars === stars)?.count ?? 0; return <div key={stars}><span>{stars} sao</span><meter min={0} max={Math.max(1, stats.ratingCount)} value={count} aria-label={`${stars} sao: ${count} đánh giá`} /><span>{count}</span></div>; })}</div>
      </> : !statsError && <p role="status">Đang tải thống kê…</p>}
      {authError && <p role="alert">{authError}</p>}
      {!authReady ? <p className="hint">Đang tải tài khoản…</p> : viewer ? <div className="rating-editor"><p>Đánh giá của bạn</p><div className="rating-buttons" role="group" aria-label="Chọn số sao">{[1,2,3,4,5].map(value => <button key={value} type="button" className="button-secondary" aria-label={`${value} sao`} aria-pressed={rating === value} disabled={busy} onClick={() => rate(value)}>{value} <span aria-hidden="true">★</span></button>)}</div>{rating !== null && <button className="button-secondary" disabled={busy} onClick={() => rate(null)}>Xóa đánh giá của tôi</button>}</div> : !authError && <p><Link href="/login">Đăng nhập để đánh giá</Link></p>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
    <CommunityComments endpoint={`${base}/comments`} viewer={viewer} canCreate={authReady && !authError} revision={revision} onChange={refreshStats} />
  </div>;
}
