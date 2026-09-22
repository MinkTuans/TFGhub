"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminCategory, AdminDocument, AdminDocumentList } from "@indieforge/contracts";
import { api, ApiError } from "../../lib/api-client";
import { MarkdownReader } from "./markdown-reader";
import styles from "./library.module.css";

const base = "/admin/library";
const limit = 6;
type Draft = { title: string; content: string; categoryId: string };
type CategoryDraft = { id?: string; version?: number; name: string; description: string };
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Dữ liệu đã thay đổi hoặc danh mục vẫn còn tài liệu. Bản thảo của bạn vẫn được giữ. Hãy tải lại bản mới nhất trước khi tiếp tục.";
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại; giữ lại bản thảo trước khi rời trang.";
    if (error.status === 403) return "Bạn không có quyền quản trị thư viện.";
    if (error.status === 404) return "Tài liệu hoặc danh mục này không còn tồn tại.";
    if (error.status === 400) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường và thử lại.";
  }
  return "Không thể hoàn tất thao tác. Vui lòng thử lại. Bản thảo của bạn vẫn được giữ.";
}
export function AdminLibrary({ initialCategories, initialDocuments, initialDocument = null }: { initialCategories: AdminCategory[]; initialDocuments: AdminDocumentList; initialDocument?: AdminDocument | null }) {
  const [categories, setCategories] = useState(initialCategories);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selected, setSelected] = useState<AdminDocument | null>(initialDocument);
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const mutationSaved = useRef(false);
  const reader = useRef<HTMLElement>(null);
  const categoryRail = useRef<HTMLDivElement>(null);
  function slideCategories(direction: number) {
    const rail = categoryRail.current;
    rail?.scrollBy({ left: direction * rail.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  const editingDocument = draft !== null;
  const editingCategory = categoryDraft !== null;
  useEffect(() => {
    if (window.innerWidth <= 760 && (selected || editingDocument || editingCategory)) reader.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [selected, editingDocument, editingCategory]);
  const dirty = (draft !== null || categoryDraft !== null) && JSON.stringify(draft ?? categoryDraft) !== baseline;
  function mayLeave() { return !dirty || window.confirm("Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?"); }
  useEffect(() => {
    if (!dirty && !pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.<HTMLElement>("a, .site-navigation .nav-button");
      if (!anchor || anchor.dataset.librarySource === "true" || anchor.getAttribute("target") === "_blank" || anchor.getAttribute("href")?.startsWith("#")) return;
      if (pending || !window.confirm("Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, [dirty, pending]);
  useEffect(() => {
    if (!dirty) return;
    // A same-URL history entry lets Back ask before Next unmounts this draft.
    const originalState = window.history.state;
    const url = window.location.href;
    const token = `library-${Date.now()}`;
    const guardedState = { ...originalState, adminLibraryDraft: token };
    window.history.pushState(guardedState, "", url);
    let leaving = false;
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      if (busy.current || !window.confirm("Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?")) {
        window.history.pushState(guardedState, "", url);
      } else {
        leaving = true;
        window.removeEventListener("popstate", back, true);
        window.history.back();
      }
    };
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("popstate", back, true);
      if (!leaving && window.history.state?.adminLibraryDraft === token && window.location.href === url) window.history.back();
    };
  }, [dirty]);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; mutationSaved.current = false; setPending(true); setError(""); setConflict(false); setNotice("");
    try { await action(); } catch (cause) { setError(mutationSaved.current ? "Thay đổi đã được lưu, nhưng chưa thể tải lại danh sách. Vui lòng tải lại trang để cập nhật danh sách." : message(cause)); setConflict(cause instanceof ApiError && cause.status === 409); }
    finally { busy.current = false; setPending(false); }
  }
  async function refresh(nextCategory = categoryId, nextQuery = activeQuery, nextOffset = offset) {
    const params = new URLSearchParams({ categoryId: nextCategory, query: nextQuery, offset: String(nextOffset), limit: String(limit) });
    if (!nextCategory) params.delete("categoryId");
    const [nextCategories, nextDocuments] = await Promise.all([api.get<AdminCategory[]>(`${base}/categories`), api.get<AdminDocumentList>(`${base}/documents?${params}`)]);
    setCategories(nextCategories); setDocuments(nextDocuments); setCategoryId(nextCategory); setActiveQuery(nextQuery); setOffset(nextOffset);
  }
  function discard() { setDraft(null); setCategoryDraft(null); setPreview(false); }
  function select(id: string) { if (!mayLeave()) return; void run(async () => { const document = await api.get<AdminDocument>(`${base}/documents/${encodeURIComponent(id)}`); discard(); setSelected(document); }); }
  function filter(nextCategory: string, nextQuery: string, nextOffset = 0) { if (!mayLeave()) return; void run(async () => { await refresh(nextCategory, nextQuery, nextOffset); discard(); }); }
  function editDocument(document: AdminDocument | null) {
    if (!mayLeave()) return;
    const value = { title: document?.title ?? "", content: document?.content ?? "", categoryId: document?.categoryId ?? (categoryId || categories[0]?.id || "") };
    setSelected(document); setDraft(value); setCategoryDraft(null); setBaseline(JSON.stringify(value)); setPreview(false); setError(""); setConflict(false);
  }
  function editCategory(category?: AdminCategory) {
    if (!mayLeave()) return;
    const value = { ...(category ? { id: category.id, version: category.version } : {}), name: category?.name ?? "", description: category?.description ?? "" };
    setCategoryDraft(value); setDraft(null); setBaseline(JSON.stringify(value)); setError(""); setConflict(false);
  }
  function saveDocument(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (!draft.title.trim() || draft.title.trim().length > 200 || !draft.categoryId || draft.content.length > 200000) { setError("Vui lòng nhập tiêu đề (tối đa 200 ký tự), chọn danh mục và giới hạn nội dung trong 200.000 ký tự."); return; }
    void run(async () => {
      const body = { ...draft, title: draft.title.trim() };
      const saved = selected ? await api.patch<AdminDocument>(`${base}/documents/${encodeURIComponent(selected.id)}`, { ...body, version: selected.version }) : await api.post<AdminDocument>(`${base}/documents`, body);
      mutationSaved.current = true; setSelected(saved); discard(); setNotice("Đã lưu tài liệu."); await refresh(categoryId, activeQuery, 0);
    });
  }
  function saveCategory(event: FormEvent) {
    event.preventDefault(); if (!categoryDraft) return;
    if (!categoryDraft.name.trim() || categoryDraft.name.trim().length > 100 || categoryDraft.description.length > 500) { setError("Tên danh mục cần từ 1–100 ký tự; mô tả tối đa 500 ký tự."); return; }
    void run(async () => {
      const body = { name: categoryDraft.name.trim(), description: categoryDraft.description };
      if (categoryDraft.id) await api.patch(`${base}/categories/${encodeURIComponent(categoryDraft.id)}`, { ...body, version: categoryDraft.version });
      else await api.post(`${base}/categories`, body);
      mutationSaved.current = true; discard(); setNotice("Đã lưu danh mục."); await refresh();
    });
  }
  function removeDocument() {
    if (!selected || !window.confirm(`Xóa tài liệu “${selected.title}”? Thao tác này không thể hoàn tác.`)) return;
    void run(async () => { await api.delete(`${base}/documents/${encodeURIComponent(selected.id)}`, { version: selected.version }); mutationSaved.current = true; setSelected(null); discard(); await refresh(categoryId, activeQuery, 0); setNotice("Đã xóa tài liệu."); });
  }
  function removeCategory(category: AdminCategory) {
    if (!mayLeave() || !window.confirm(`Xóa danh mục “${category.name}”? Chỉ có thể xóa danh mục không còn tài liệu.`)) return;
    void run(async () => { await api.delete(`${base}/categories/${encodeURIComponent(category.id)}`, { version: category.version }); mutationSaved.current = true; discard(); await refresh(categoryId === category.id ? "" : categoryId, activeQuery, 0); setNotice("Đã xóa danh mục."); });
  }
  function openSource(path: string) {
    if (!mayLeave()) return;
    void run(async () => { const result = await api.get<AdminDocumentList>(`${base}/documents?sourcePath=${encodeURIComponent(path)}&limit=1`); if (!result.items[0]) throw new ApiError(404, "Missing document"); const document = await api.get<AdminDocument>(`${base}/documents/${encodeURIComponent(result.items[0].id)}`); discard(); setSelected(document); });
  }
  function reload() {
    if (!mayLeave()) return;
    void run(async () => {
      if (categoryDraft?.id) { const next = await api.get<AdminCategory[]>(`${base}/categories`); setCategories(next); const category = next.find((item) => item.id === categoryDraft.id); if (!category) { discard(); } else { const value = { id: category.id, version: category.version, name: category.name, description: category.description }; setCategoryDraft(value); setBaseline(JSON.stringify(value)); } }
      else if (selected) { const next = await api.get<AdminDocument>(`${base}/documents/${encodeURIComponent(selected.id)}`); setSelected(next); const value = { title: next.title, content: next.content, categoryId: next.categoryId }; if (draft) { setDraft(value); setBaseline(JSON.stringify(value)); } }
      await refresh();
    });
  }
  const currentCategory = categories.find((item) => item.id === categoryId);
  return <div className={styles.library} aria-busy={pending}>
    <header className={styles.heading}><div><h1>Thư viện website</h1><p>Thông tin dự án, hướng dẫn và kiến thức vận hành — cùng một nơi.</p></div><button disabled={pending || !categories.length} onClick={() => editDocument(null)}>Viết tài liệu</button></header>
    {error && <div className={styles.error} role="alert">{error}{conflict && <button disabled={pending} onClick={reload}>Tải lại bản mới nhất</button>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="Danh mục thư viện">
        <div className={styles.categoryHeading}>
          <div className={styles.sectionHeading}><h2>Danh mục</h2><span>{categories.length}</span></div>
          <div className={styles.categoryControls}>
            <button type="button" className="button-ghost" aria-label="Trượt danh mục sang trái" onClick={() => slideCategories(-1)}>←</button>
            <button type="button" className="button-ghost" aria-label="Trượt danh mục sang phải" onClick={() => slideCategories(1)}>→</button>
            <button type="button" className="button-ghost" disabled={pending} onClick={() => editCategory()}>Thêm danh mục</button>
          </div>
        </div>
        <div ref={categoryRail} className={styles.categoryRail} role="region" aria-label="Trượt danh mục" tabIndex={0}>
          <button className={`button-ghost ${styles.category}`} aria-pressed={!categoryId} disabled={pending} onClick={() => filter("", activeQuery)}><strong>Tất cả tài liệu</strong><span>{categories.reduce((sum, item) => sum + item.documentCount, 0)}</span></button>
          {categories.map((item) => <button key={item.id} className={`button-ghost ${styles.category}`} aria-pressed={categoryId === item.id} disabled={pending} title={item.name} onClick={() => filter(item.id, activeQuery)}><strong>{item.name}</strong><span>{item.documentCount}</span></button>)}
        </div>
        {currentCategory && <div className={styles.categoryDetails}><p>{currentCategory.description || "Chưa có mô tả."}</p><div className={styles.actions}><button className="button-ghost" disabled={pending} onClick={() => editCategory(currentCategory)}>Sửa danh mục</button><button className={`button-danger ${styles.danger}`} disabled={pending || currentCategory.documentCount > 0} title={currentCategory.documentCount ? "Chuyển hoặc xóa hết tài liệu trước" : undefined} onClick={() => removeCategory(currentCategory)}>Xóa danh mục</button></div>{currentCategory.documentCount > 0 && <small>Chuyển hoặc xóa hết tài liệu trước khi xóa danh mục.</small>}</div>}
      </aside>
      <section className={styles.list} aria-label="Danh sách tài liệu"><form className={styles.search} onSubmit={(event) => { event.preventDefault(); filter(categoryId, query); }}><label htmlFor="library-search">Tìm tài liệu</label><div><input id="library-search" maxLength={200} placeholder="Tiêu đề hoặc nội dung…" value={query} onChange={(event) => setQuery(event.target.value)} /><button disabled={pending}>Tìm</button></div></form><p className={styles.count}>{documents.total} tài liệu{activeQuery && ` · “${activeQuery}”`}</p>
        <div className={styles.documentList}>{documents.items.map((item) => <button className={`button-ghost ${styles.document}`} aria-label={item.title} aria-pressed={selected?.id === item.id} disabled={pending} key={item.id} onClick={() => select(item.id)}><strong>{item.title}</strong><span>{categories.find((category) => category.id === item.categoryId)?.name ?? "Danh mục"}</span></button>)}{!documents.items.length && <p className={styles.empty}>Chưa có tài liệu phù hợp. Thử từ khóa khác hoặc viết tài liệu đầu tiên.</p>}</div>
        <div className={styles.pagination}><button className="button-ghost" disabled={pending || offset === 0} onClick={() => filter(categoryId, activeQuery, Math.max(0, offset - limit))}>Trước</button><span>Trang {Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil(documents.total / limit))}</span><button className="button-ghost" disabled={pending || offset + limit >= documents.total} onClick={() => filter(categoryId, activeQuery, offset + limit)}>Sau</button></div>
      </section>
      <section ref={reader} className={styles.reader} aria-label="Nội dung tài liệu">
        {categoryDraft ? <form onSubmit={saveCategory}><h2>{categoryDraft.id ? "Chỉnh sửa danh mục" : "Danh mục mới"}</h2><fieldset disabled={pending}><label>Tên danh mục<input required maxLength={100} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label><label htmlFor="library-category-description">Mô tả</label><textarea id="library-category-description" maxLength={500} rows={5} value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} /><div className={styles.actions}><button>{pending ? "Đang lưu…" : "Lưu danh mục"}</button><button type="button" className="button-ghost" onClick={() => { if (mayLeave()) discard(); }}>Hủy chỉnh sửa</button></div></fieldset></form>
        : draft ? <form onSubmit={saveDocument}><div className={styles.sectionHeading}><h2>{selected ? "Chỉnh sửa tài liệu" : "Tài liệu mới"}</h2><span>{dirty ? "Chưa lưu" : "Bản thảo"}</span></div><fieldset disabled={pending}><label>Tiêu đề<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label htmlFor="library-document-category">Danh mục</label><select id="library-document-category" required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selected?.sourcePath && <p className={styles.provenance}>Nguồn nhập: <code>{selected.sourcePath}</code></p>}<div className={styles.actions}><button type="button" className="button-ghost" aria-pressed={!preview} onClick={() => setPreview(false)}>Soạn thảo</button><button type="button" className="button-ghost" aria-pressed={preview} onClick={() => setPreview(true)}>Xem trước</button></div>{preview ? <MarkdownReader content={draft.content} sourcePath={selected?.sourcePath ?? null} onSourceLink={openSource} /> : <><label htmlFor="library-document-content">Nội dung Markdown</label><textarea id="library-document-content" className={styles.editor} maxLength={200000} rows={18} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></>}<p className={styles.hint}>Hỗ trợ tiêu đề, danh sách, liên kết, bảng và khối mã. {draft.content.length.toLocaleString("vi-VN")} / 200.000 ký tự.</p><div className={styles.actions}><button>{pending ? "Đang lưu…" : "Lưu tài liệu"}</button><button type="button" className="button-ghost" onClick={() => { if (mayLeave()) discard(); }}>Hủy chỉnh sửa</button></div></fieldset></form>
        : selected ? <article><div className={styles.sectionHeading}><span className={styles.count}>{categories.find((item) => item.id === selected.categoryId)?.name}</span><span className={styles.count}>Phiên bản {selected.version}</span></div><h2 className={styles.documentTitle}>{selected.title}</h2><p className={styles.hint}>Cập nhật {new Date(selected.updatedAt).toLocaleDateString("vi-VN")}</p><div className={styles.actions}><button className="button-ghost" disabled={pending} onClick={() => editDocument(selected)}>Sửa tài liệu</button><button className={`button-danger ${styles.danger}`} disabled={pending} onClick={removeDocument}>Xóa tài liệu</button></div>{selected.sourcePath && <p className={styles.provenance}>Nguồn nhập: <code>{selected.sourcePath}</code></p>}<MarkdownReader content={selected.content} sourcePath={selected.sourcePath} onSourceLink={openSource} /></article>
        : <div className={styles.welcome}><span aria-hidden="true" className={styles.book}>▤</span><p className="eyebrow">THƯ VIỆN DỰ ÁN</p><h2>Kiến thức luôn trong tầm tay</h2><p>Chọn một tài liệu để đọc, hoặc bắt đầu ghi lại hướng dẫn mới cho website.</p>{!categories.length && <p>Hãy thêm danh mục đầu tiên để bắt đầu.</p>}</div>}
      </section>
    </div>
  </div>;
}
