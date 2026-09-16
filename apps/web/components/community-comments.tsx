"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { EngagementComments } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export type CommunityViewer = { id: string; role: "USER" | "MODERATOR" | "ADMIN" };

export function CommunityComments({ endpoint, viewer, canCreate = false, revision = 0, onChange }: {
  endpoint: string;
  viewer: CommunityViewer | null;
  canCreate?: boolean;
  revision?: number;
  onChange?: () => void;
}) {
  const inputId = useId();
  const [data, setData] = useState<EngagementComments | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    api.get<EngagementComments>(`${endpoint}?offset=${offset}&limit=20`).then((result) => {
      if (alive) { setData(result); setLoadError(""); setLoading(false); }
    }).catch(() => { if (alive) { setLoadError("Không thể tải bình luận. Vui lòng thử lại."); setLoading(false); } });
    return () => { alive = false; };
  }, [endpoint, offset, refresh, revision]);

  function reload() { setLoading(true); setRefresh(value => value + 1); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.post(endpoint, { body: body.trim() });
      setBody(""); setOffset(0); reload(); onChange?.(); setNotice("Đã gửi bình luận.");
    } catch (failure) {
      setError(failure instanceof ApiError && (failure.status === 429 || failure.status === 409)
        ? "Vui lòng chờ 30 giây giữa các bình luận rồi thử lại."
        : failure instanceof ApiError && failure.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : "Không thể gửi bình luận. Nội dung của bạn vẫn được giữ lại.");
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.delete(`${endpoint}/${encodeURIComponent(id)}`, undefined);
      if (data?.items.length === 1 && offset > 0) setOffset(value => Math.max(0, value - 20));
      reload(); onChange?.(); setNotice("Đã xóa bình luận.");
    } catch { setError("Không thể xóa bình luận. Vui lòng kiểm tra quyền truy cập và thử lại."); }
    finally { setBusy(false); }
  }
  return <section className="community panel" aria-label="Bình luận cộng đồng">
    <header className="engagement-heading"><h2>Bình luận</h2>{data && <span className="badge">{data.total}</span>}</header>
    {canCreate && (viewer ? <form onSubmit={submit} className="community-form">
      <label htmlFor={inputId}>Bình luận của bạn</label><textarea id={inputId} value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={3} required disabled={busy} placeholder="Chia sẻ trải nghiệm của bạn…" />
      <div className="engagement-heading"><small className="hint">{body.length} / 2000 ký tự · Văn bản thuần</small><button disabled={busy || !body.trim()}>{busy ? "Đang xử lý…" : "Gửi bình luận"}</button></div>
    </form> : <p><Link href="/login">Đăng nhập để bình luận</Link></p>)}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Đang tải bình luận…</p>}
    {loadError ? <div role="alert"><p>{loadError}</p><button className="button-secondary" onClick={reload}>Thử lại</button></div> : !loading && <>
      {data?.items.length ? <ul className="community-list">{data.items.map(comment => <li key={comment.id}>
        <div className="engagement-heading"><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString("vi-VN", { timeZone: "UTC" })}</time></div>
        {comment.rating !== null && <span className="hint">Đánh giá hiện tại: {comment.rating} / 5 sao</span>}
        <p className="community-body">{comment.body}</p>
        {viewer && (viewer.id === comment.author.id || viewer.role === "MODERATOR" || viewer.role === "ADMIN") && <button className="button-secondary" disabled={busy} onClick={() => remove(comment.id)}>Xóa bình luận</button>}
      </li>)}</ul> : <p className="hint">Chưa có bình luận nào.</p>}
      {data && data.total > 20 && <nav className="engagement-pagination" aria-label="Trang bình luận">
        <button className="button-secondary" disabled={offset === 0 || busy} onClick={() => { setLoading(true); setOffset(value => value - 20); }}>Trang trước</button>
        <span>Trang {Math.floor(offset / 20) + 1} / {Math.ceil(data.total / 20)}</span>
        <button className="button-secondary" disabled={offset + 20 >= data.total || busy} onClick={() => { setLoading(true); setOffset(value => value + 20); }}>Trang sau</button>
      </nav>}
    </>}
  </section>;
}
