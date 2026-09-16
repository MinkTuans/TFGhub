"use client";
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { ApiError } from "../../lib/api-client";
import styles from "./management.module.css";
export const roles = { USER: "Người dùng", MODERATOR: "Kiểm duyệt viên", ADMIN: "Quản trị viên" };
export const reviews = { DRAFT: "Bản nháp", PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối" };
export const visibilityLabels = { DRAFT: "Ẩn / bản nháp", PUBLIC: "Công khai", UNLISTED: "Không liệt kê" };
export const moderationLabels = { CLEAR: "Bình thường", FLAGGED: "Đánh dấu", QUARANTINED: "Cách ly" };
export const accessLabels = { GUEST_ALLOWED: "Cho phép khách", AUTH_REQUIRED: "Cần đăng nhập" };
export function Options({ values }: { values: Record<string, string> }) { return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>); }
export function queryString(filters: Record<string, string>, offset: number) {
  const params = new URLSearchParams({ offset: String(offset), limit: "10" });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
  return params;
}
const departure = "Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?";
export function useManagement(dirty: boolean, kind: "user" | "game") {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const saved = useRef(false);
  const mayLeave = () => !busy.current && (!dirty || window.confirm(departure));
  useEffect(() => {
    if (!dirty && !pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a, .site-navigation .nav-button");
      if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.getAttribute("href")?.startsWith("#")) return;
      if (busy.current || !window.confirm(departure)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, [dirty, pending]);
  useEffect(() => {
    if (!dirty) return;
    const url = window.location.href;
    const token = `management-${Date.now()}`;
    const state = { ...window.history.state, adminManagementDraft: token };
    window.history.pushState(state, "", url);
    let leaving = false;
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      if (busy.current || !window.confirm(departure)) window.history.pushState(state, "", url);
      else { leaving = true; window.removeEventListener("popstate", back, true); window.history.back(); }
    };
    window.addEventListener("popstate", back, true);
    return () => { window.removeEventListener("popstate", back, true); if (!leaving && window.history.state?.adminManagementDraft === token && window.location.href === url) window.history.back(); };
  }, [dirty]);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; saved.current = false; setPending(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) {
      let text = "Không thể hoàn tất thao tác. Vui lòng thử lại. Bản thảo của bạn vẫn được giữ.";
      if (cause instanceof ApiError) {
        if (cause.status === 409) text = kind === "user"
          ? "Dữ liệu đã thay đổi, email đã tồn tại hoặc tài khoản được bảo vệ / còn nội dung liên quan. Bản thảo của bạn vẫn được giữ. Hãy tải lại bản mới nhất; có thể khóa tài khoản thay vì xóa."
          : "Dữ liệu đã thay đổi hoặc game chưa đủ điều kiện / còn bản dựng, bản phát hành. Bản thảo của bạn vẫn được giữ. Hãy tải lại bản mới nhất; có thể ẩn hoặc cách ly thay vì xóa.";
        if (cause.status === 401) text = "Phiên đăng nhập đã hết hạn. Giữ lại bản thảo trước khi đăng nhập lại.";
        if (cause.status === 403) text = "Bạn không còn quyền quản trị. Bản thảo của bạn vẫn được giữ.";
        if (cause.status === 404) text = "Dữ liệu này không còn tồn tại. Hãy tải lại danh sách.";
        if (cause.status === 400) text = "Thông tin chưa hợp lệ. Kiểm tra các trường và thử lại.";
      }
      setError(saved.current ? "Thay đổi đã được lưu, nhưng chưa tải lại được danh sách. Hãy thử tải lại danh sách." : text);
    } finally { busy.current = false; setPending(false); }
  }
  function markSaved() { saved.current = true; setNotice("Đã lưu thay đổi."); }
  return { pending, error, notice, setError, run, mayLeave, markSaved };
}
export function Pagination({ offset, total, pending, onPage }: { offset: number; total: number; pending: boolean; onPage: (offset: number) => void }) {
  return <div className={styles.pagination}><button type="button" disabled={pending || offset === 0} onClick={() => onPage(Math.max(0, offset - 10))}>Trang trước</button><span>Trang {Math.floor(offset / 10) + 1} / {Math.max(1, Math.ceil(total / 10))} · {total} kết quả</span><button type="button" disabled={pending || offset + 10 >= total} onClick={() => onPage(offset + 10)}>Trang sau</button></div>;
}

export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
