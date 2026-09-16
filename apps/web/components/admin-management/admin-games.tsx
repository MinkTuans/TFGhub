"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminGameUpdateInput, type AdminManagedGame, type AdminManagedGameList } from "@indieforge/contracts";
import { api } from "../../lib/api-client";
import { AdminNavigation } from "./admin-navigation";
import { Field, accessLabels, moderationLabels, Options, Pagination, queryString, reviews, useManagement, visibilityLabels } from "./shared";
import styles from "./management.module.css";
type Draft = Pick<AdminManagedGame, "title" | "description" | "accessMode" | "visibility" | "moderationState">;
const draftOf = (game: AdminManagedGame): Draft => ({ title: game.title, description: game.description, accessMode: game.accessMode, visibility: game.visibility, moderationState: game.moderationState });
export function AdminGames({ initialGames }: { initialGames: AdminManagedGameList }) {
  const [games, setGames] = useState(initialGames);
  const [filters, setFilters] = useState({ query: "", ownerId: "", reviewState: "", moderationState: "", visibility: "" });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminManagedGame | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const editor = useRef<HTMLElement>(null);
  const editing = draft !== null;
  useEffect(() => { if (editing && window.innerWidth <= 760) editor.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [selected, editing]);
  const ui = useManagement(draft !== null && JSON.stringify(draft) !== baseline, "game");
  function edit(game: AdminManagedGame) { const value = draftOf(game); setSelected(game); setDraft(value); setBaseline(JSON.stringify(value)); }
  async function refresh(next = applied, page = offset) { const result = await api.get<AdminManagedGameList>(`/admin/games?${queryString(next, page)}`); setGames(result); setApplied(next); setOffset(page); }
  function filter(next = applied, page = 0) { if (!ui.mayLeave()) return; void ui.run(async () => { await refresh(next, page); setDraft(null); setSelected(null); }); }
  function select(id: string) { if (!ui.mayLeave()) return; void ui.run(async () => edit(await api.get<AdminManagedGame>(`/admin/games/${encodeURIComponent(id)}`))); }
  async function save() {
    if (!draft || !selected) return;
    const parsed = AdminGameUpdateInput.safeParse({ ...draft, updatedAt: selected.updatedAt });
    if (!parsed.success) { ui.setError("Kiểm tra tiêu đề (1–80 ký tự) và mô tả (tối đa 2.000 ký tự)."); return; }
    await ui.run(async () => { const game = await api.patch<AdminManagedGame>(`/admin/games/${encodeURIComponent(selected.id)}`, parsed.data); edit(game); ui.markSaved(); await refresh(); });
  }
  function remove() {
    if (!selected || !window.confirm(`Xóa game “${selected.title}”? Thao tác này không thể hoàn tác.`)) return;
    void ui.run(async () => { await api.delete(`/admin/games/${encodeURIComponent(selected.id)}`, { updatedAt: selected.updatedAt }); setDraft(null); setSelected(null); ui.markSaved(); await refresh(applied, games.items.length === 1 ? Math.max(0, offset - 10) : offset); });
  }
  return <main className={styles.page}><AdminNavigation /><div className={styles.heading}><h1>Quản lý game</h1><Link className="button" href="/studio/games/new">Tạo game trong Studio</Link></div><p className={styles.hint}>Tất cả game của mọi tác giả. Game mới được tạo dưới tài khoản của bạn.</p>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); filter(filters); }}>
      <Field label="Tìm game"><input maxLength={200} value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Tên, đường dẫn hoặc email tác giả" /></Field>
      <Field label="Mã chủ sở hữu"><input maxLength={128} value={filters.ownerId} onChange={event => setFilters({ ...filters, ownerId: event.target.value })} /></Field>
      <Field label="Trạng thái duyệt lọc"><select value={filters.reviewState} onChange={event => setFilters({ ...filters, reviewState: event.target.value })}><option value="">Tất cả</option><Options values={reviews} /></select></Field>
      <Field label="Kiểm soát nội dung lọc"><select value={filters.moderationState} onChange={event => setFilters({ ...filters, moderationState: event.target.value })}><option value="">Tất cả</option><Options values={moderationLabels} /></select></Field>
      <Field label="Hiển thị lọc"><select value={filters.visibility} onChange={event => setFilters({ ...filters, visibility: event.target.value })}><option value="">Tất cả</option><Options values={visibilityLabels} /></select></Field><button disabled={ui.pending}>Áp dụng bộ lọc</button>
    </form>
    {ui.error && <div role="alert" className={styles.error}>{ui.error}</div>}{ui.notice && <p role="status" className={styles.notice}>{ui.notice}</p>}
    <div className={styles.workspace} data-editing={draft !== null}><section aria-label="Danh sách game" className={`${styles.panel} ${styles.listPanel}`}><div className={styles.list}>{games.items.map(game => <article className={styles.row} key={game.id}><strong>{game.title}</strong><p>{game.slug} · {game.ownerName || game.ownerEmail}</p><p>{game.ownerEmail}</p><p>{reviews[game.reviewState]} · {visibilityLabels[game.visibility]} · {moderationLabels[game.moderationState]}</p><div className={styles.actions}><Link href={`/studio/games/${encodeURIComponent(game.id)}/analytics`}>Thống kê</Link><Link href={`/moderation/games/${encodeURIComponent(game.id)}/comments`}>Bình luận</Link><button disabled={ui.pending} aria-label={`Sửa ${game.title}`} onClick={() => select(game.id)}>Xem / sửa</button><button disabled={ui.pending} onClick={() => { const next = { ...filters, ownerId: game.ownerId }; if (!ui.mayLeave()) return; setFilters(next); void ui.run(async () => { await refresh(next, 0); setDraft(null); setSelected(null); }); }}>Game cùng tác giả</button></div></article>)}</div>{games.items.length === 0 && <p>Không có game phù hợp.</p>}<Pagination offset={offset} total={games.total} pending={ui.pending} onPage={page => filter(applied, page)} /><button disabled={ui.pending} onClick={() => filter()}>Tải lại danh sách</button></section>
      <section ref={editor} className={styles.panel} aria-label="Thông tin game">{draft && selected ? <form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }}><h2>Sửa game</h2><p className={styles.hint}>{selected.ownerEmail} · {reviews[selected.reviewState]} · {selected.artifactReady ? "Bản chơi sẵn sàng" : "Chưa có bản chơi sẵn sàng"}</p><fieldset disabled={ui.pending}>
        <Field label="Tiêu đề"><input required maxLength={80} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></Field>
        <Field label="Mô tả"><textarea maxLength={2000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></Field>
        <Field label="Quyền truy cập"><select value={draft.accessMode} onChange={event => setDraft({ ...draft, accessMode: event.target.value as Draft["accessMode"] })}><Options values={accessLabels} /></select></Field>
        <Field label="Hiển thị"><select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value as Draft["visibility"] })}><Options values={visibilityLabels} /></select></Field>
        <Field label="Kiểm soát nội dung"><select value={draft.moderationState} onChange={event => setDraft({ ...draft, moderationState: event.target.value as Draft["moderationState"] })}><Options values={moderationLabels} /></select></Field>
        <p className={styles.hint}>Sửa tên, mô tả hoặc quyền truy cập của game đã duyệt / chờ duyệt sẽ đưa game về bản nháp. Công khai cần game đã duyệt, bản chơi sẵn sàng và nội dung bình thường. Đánh dấu hoặc cách ly sẽ ẩn game; gỡ cách ly không tự công khai.</p>
        <div className={styles.actions}><button type="submit">{ui.pending ? "Đang lưu…" : "Lưu game"}</button><button type="button" onClick={() => { if (ui.mayLeave()) { setDraft(null); setSelected(null); } }}>Hủy chỉnh sửa</button></div>
        <button type="button" onClick={() => select(selected.id)}>Tải lại bản mới nhất</button><button type="button" className={styles.danger} onClick={remove}>Xóa game</button><p className={styles.hint}>{selected.buildCount} bản dựng · {selected.releaseCount} bản phát hành. Game có bản dựng hoặc bản phát hành không thể xóa; hãy ẩn hoặc cách ly.</p>
      </fieldset><Link href="/moderation">Mở hàng đợi kiểm duyệt để duyệt / từ chối</Link></form> : <p>Chọn game để xem chi tiết và chỉnh sửa.</p>}</section>
    </div></main>;
}
