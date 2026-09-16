"use client";
import { useEffect, useRef, useState } from "react";
import { AdminUserCreateInput, AdminUserUpdateInput, type AdminManagedUser, type AdminManagedUserList } from "@indieforge/contracts";
import { api } from "../../lib/api-client";
import { AdminNavigation } from "./admin-navigation";
import { Field, Options, Pagination, queryString, roles, useManagement } from "./shared";
import styles from "./management.module.css";
type Draft = { email: string; displayName: string; password: string; role: AdminManagedUser["role"]; isActive: boolean };
const empty: Draft = { email: "", displayName: "", password: "", role: "USER", isActive: true };
const draftOf = (user: AdminManagedUser): Draft => ({ email: user.email, displayName: user.displayName ?? "", password: "", role: user.role, isActive: user.isActive });
export function AdminUsers({ initialUsers, currentUserId }: { initialUsers: AdminManagedUserList; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [filters, setFilters] = useState({ query: "", role: "", active: "" });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminManagedUser | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const editor = useRef<HTMLElement>(null);
  const editing = draft !== null;
  useEffect(() => { if (editing && window.innerWidth <= 760) editor.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [selected, editing]);
  const ui = useManagement(draft !== null && JSON.stringify(draft) !== baseline, "user");
  function edit(user: AdminManagedUser | null) { const value = user ? draftOf(user) : { ...empty }; setSelected(user); setDraft(value); setBaseline(JSON.stringify(value)); }
  async function refresh(next = applied, page = offset) { const result = await api.get<AdminManagedUserList>(`/admin/users?${queryString(next, page)}`); setUsers(result); setApplied(next); setOffset(page); }
  function filter(next = applied, page = 0) { if (!ui.mayLeave()) return; void ui.run(async () => { await refresh(next, page); setDraft(null); }); }
  function select(id: string) { if (!ui.mayLeave()) return; void ui.run(async () => edit(await api.get<AdminManagedUser>(`/admin/users/${encodeURIComponent(id)}`))); }
  async function save() {
    if (!draft) return;
    const data = { ...draft, ...(draft.displayName.trim() ? {} : { displayName: undefined }), ...(draft.password ? {} : { password: undefined }), ...(selected ? { version: selected.version } : {}) };
    const parsed = selected ? AdminUserUpdateInput.safeParse(data) : AdminUserCreateInput.safeParse(data);
    if (!parsed.success) { ui.setError("Kiểm tra email, tên hiển thị (2–50 ký tự) và mật khẩu (8–128 ký tự, có chữ hoa, chữ thường, số và ký hiệu)."); return; }
    await ui.run(async () => {
      const user = selected ? await api.patch<AdminManagedUser>(`/admin/users/${encodeURIComponent(selected.id)}`, parsed.data) : await api.post<AdminManagedUser>("/admin/users", parsed.data);
      edit(user); ui.markSaved(); await refresh();
    });
  }
  function remove() {
    if (!selected || !window.confirm(`Xóa tài khoản ${selected.email}? Thao tác này không thể hoàn tác.`)) return;
    void ui.run(async () => { await api.delete(`/admin/users/${encodeURIComponent(selected.id)}`, { version: selected.version }); setDraft(null); setSelected(null); ui.markSaved(); await refresh(applied, users.items.length === 1 ? Math.max(0, offset - 10) : offset); });
  }
  return <main className={styles.page}><AdminNavigation /><div className={styles.heading}><h1>Quản lý người dùng</h1><button disabled={ui.pending} onClick={() => { if (ui.mayLeave()) edit(null); }}>Thêm người dùng</button></div>
    <p className={styles.hint}>Quản lý tài khoản và quyền truy cập. Không thể khóa, hạ quyền hay xóa chính mình hoặc quản trị viên hoạt động cuối cùng.</p>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); filter(filters); }}>
      <Field label="Tìm người dùng"><input maxLength={200} value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Email hoặc tên hiển thị" /></Field>
      <Field label="Vai trò lọc"><select value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}><option value="">Tất cả vai trò</option><Options values={roles} /></select></Field>
      <Field label="Trạng thái lọc"><select value={filters.active} onChange={event => setFilters({ ...filters, active: event.target.value })}><option value="">Tất cả trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Đã khóa</option></select></Field>
      <button disabled={ui.pending}>Áp dụng bộ lọc</button>
    </form>
    {ui.error && <div role="alert" className={styles.error}>{ui.error}</div>}{ui.notice && <p role="status" className={styles.notice}>{ui.notice}</p>}
    <div className={styles.workspace}><section aria-label="Danh sách người dùng" className={styles.panel}><div className={styles.list}>{users.items.map(user => <article className={styles.row} key={user.id}><strong>{user.displayName || user.email}</strong><p>{user.email}</p><p>{roles[user.role]} · {user.isActive ? "Đang hoạt động" : "Đã khóa"} · {user.gameCount} game</p><button disabled={ui.pending} onClick={() => select(user.id)} aria-label={`Sửa ${user.email}`}>Xem / sửa</button></article>)}</div>{users.items.length === 0 && <p>Không có người dùng phù hợp.</p>}<Pagination offset={offset} total={users.total} pending={ui.pending} onPage={page => filter(applied, page)} /><button disabled={ui.pending} onClick={() => filter()}>Tải lại danh sách</button></section>
      <section ref={editor} className={styles.panel} aria-label="Thông tin người dùng">{draft ? <form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }}><h2>{selected ? "Sửa người dùng" : "Thêm người dùng"}</h2><fieldset disabled={ui.pending}>
        <Field label="Email"><input type="email" required autoComplete="off" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></Field>
        <Field label="Tên hiển thị"><input maxLength={50} value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} /></Field>
        <Field label="Vai trò"><select disabled={selected?.id === currentUserId} value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Draft["role"] })}><Options values={roles} /></select></Field>
        <label className={styles.checkbox}><input type="checkbox" disabled={selected?.id === currentUserId} checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} />Đang hoạt động</label>
        <Field label={selected ? "Mật khẩu mới (để trống để giữ nguyên)" : "Mật khẩu"}><input type="password" autoComplete="new-password" required={!selected} minLength={8} maxLength={128} value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })} /></Field><p className={styles.hint}>Mật khẩu gồm 8–128 ký tự, có chữ hoa, chữ thường, số và ký hiệu.</p>
        <div className={styles.actions}><button type="submit">{ui.pending ? "Đang lưu…" : "Lưu người dùng"}</button><button type="button" onClick={() => { if (ui.mayLeave()) setDraft(null); }}>Hủy chỉnh sửa</button></div>
        {selected && <><button type="button" onClick={() => select(selected.id)}>Tải lại bản mới nhất</button><button className={styles.danger} disabled={selected.id === currentUserId} type="button" onClick={remove}>Xóa người dùng</button><p className={styles.hint}>Chỉ xóa tài khoản không sở hữu game và không có lịch sử nội dung liên quan. Có thể khóa tài khoản để ngăn đăng nhập.</p></>}
      </fieldset></form> : <p>Chọn người dùng để xem và chỉnh sửa, hoặc tạo tài khoản mới.</p>}</section>
    </div></main>;
}
