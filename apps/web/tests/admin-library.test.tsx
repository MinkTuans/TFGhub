import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AdminLibrary } from "../components/admin-library/admin-library";
import { api, ApiError } from "../lib/api-client";
vi.mock("../lib/api-client", async (original) => ({ ...await original<typeof import("../lib/api-client")>(), api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
const category = { id: "cat", name: "Hướng dẫn", description: "Tài liệu vận hành", version: 1, documentCount: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const document = { id: "doc", categoryId: "cat", title: "Bắt đầu", content: "# Xin chào\n\n**Nội dung**", sourcePath: "docs/start.md", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/categories") ? [category] : path.includes("/documents/") ? document : { items: [document], total: 1 }); });
function setup() { render(<AdminLibrary initialCategories={[category]} initialDocuments={{ items: [document], total: 1 }} />); }
async function edit() { setup(); fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" })); await screen.findByRole("heading", { name: "Bắt đầu" }); fireEvent.click(screen.getByRole("button", { name: "Sửa tài liệu" })); }
test("reads formatted markdown and offers category and document controls", async () => { setup(); expect(screen.getByRole("button", { name: "Thêm danh mục" })).toBeVisible(); expect(screen.getByRole("button", { name: "Viết tài liệu" })).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" })); expect(await screen.findByRole("heading", { name: "Xin chào" })).toBeVisible(); expect(screen.getByText("docs/start.md")).toBeVisible(); });
test("keeps draft after a stale save and offers explicit reload", async () => { await edit(); fireEvent.change(screen.getByLabelText("Nội dung Markdown"), { target: { value: "Bản thảo chưa lưu" } }); vi.mocked(api.patch).mockRejectedValue(new ApiError(409, "Conflict")); fireEvent.click(screen.getByRole("button", { name: "Lưu tài liệu" })); expect(await screen.findByRole("alert")).toHaveTextContent("Bản thảo của bạn vẫn được giữ"); expect(screen.getByLabelText("Nội dung Markdown")).toHaveValue("Bản thảo chưa lưu"); expect(screen.getByRole("button", { name: "Tải lại bản mới nhất" })).toBeVisible(); });
test("canceling unsaved departure preserves edits", async () => { await edit(); vi.spyOn(window, "confirm").mockReturnValue(false); fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Chưa lưu" } }); fireEvent.click(screen.getByRole("button", { name: "Hủy chỉnh sửa" })); expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Chưa lưu"); });
test("pending save disables mutation controls then shows Vietnamese failure", async () => { await edit(); let reject!: (e: Error) => void; vi.mocked(api.patch).mockImplementation(() => new Promise((_, r) => { reject = r; })); fireEvent.click(screen.getByRole("button", { name: "Lưu tài liệu" })); expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled(); reject(new Error("network")); expect(await screen.findByRole("alert")).toHaveTextContent("Không thể"); });
test("new document requires a nonblank title", async () => { setup(); fireEvent.click(screen.getByRole("button", { name: "Viết tài liệu" })); fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "   " } }); fireEvent.click(screen.getByRole("button", { name: "Lưu tài liệu" })); expect(await screen.findByRole("alert")).toHaveTextContent("tiêu đề"); });
test("delete requires confirmation and keeps selected document when canceled", async () => { setup(); fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" })); await screen.findByRole("heading", { name: "Bắt đầu" }); vi.spyOn(window, "confirm").mockReturnValue(false); fireEvent.click(screen.getByRole("button", { name: "Xóa tài liệu" })); await waitFor(() => expect(screen.getByRole("heading", { name: "Bắt đầu" })).toBeVisible()); expect(api.delete).not.toHaveBeenCalled(); });
test("dirty document blocks browser back when departure is canceled", async () => {
 await edit(); vi.spyOn(window, "confirm").mockReturnValue(false);
 fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Cần giữ lại" } });
 window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
 expect(window.confirm).toHaveBeenCalledWith("Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?");
 expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Cần giữ lại");
});
test("dirty document blocks normal navigation links and page unload", async () => {
 await edit(); vi.spyOn(window, "confirm").mockReturnValue(false);
 fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Giữ bản thảo" } });
 const link = window.document.createElement("a"); link.href = "/discover"; window.document.body.append(link);
 const click = new MouseEvent("click", { bubbles: true, cancelable: true }); link.dispatchEvent(click);
 expect(click.defaultPrevented).toBe(true); link.remove();
 const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
});
test("saving category returns to reader with updated category list", async () => {
 setup(); fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
 fireEvent.change(screen.getByLabelText("Tên danh mục"), { target: { value: "Vận hành" } });
 vi.mocked(api.post).mockResolvedValue({ ...category, name: "Vận hành" });
 vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/categories") ? [category, { ...category, id: "new", name: "Vận hành", documentCount: 0 }] : { items: [document], total: 1 });
 fireEvent.click(screen.getByRole("button", { name: "Lưu danh mục" }));
 expect(await screen.findByRole("button", { name: /Vận hành/ })).toBeVisible();
 expect(screen.queryByLabelText("Tên danh mục")).not.toBeInTheDocument();
});
test("dirty document also confirms departure through the logout button", async () => {
 await edit(); vi.spyOn(window, "confirm").mockReturnValue(false);
 fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Giữ khi đăng xuất" } });
 const nav = window.document.createElement("nav"); nav.className = "site-navigation";
 const logout = window.document.createElement("button"); logout.className = "nav-button"; logout.textContent = "Đăng xuất"; nav.append(logout); window.document.body.append(nav);
 const click = new MouseEvent("click", { bubbles: true, cancelable: true }); logout.dispatchEvent(click);
 expect(click.defaultPrevented).toBe(true); nav.remove();
});
test("populated textarea labels remain exact and exclude editable content", async () => {
 await edit();
 const content = screen.getByLabelText("Nội dung Markdown") as HTMLTextAreaElement;
 expect(content.value).toContain("Xin chào");
 expect(Array.from(content.labels ?? [], label => label.textContent).join(" ")).toBe("Nội dung Markdown");
 fireEvent.click(screen.getByRole("button", { name: "Hủy chỉnh sửa" }));
 fireEvent.click(screen.getByRole("button", { name: /^Hướng dẫn/ }));
 fireEvent.click(await screen.findByRole("button", { name: "Sửa danh mục" }));
 const description = screen.getByLabelText("Mô tả") as HTMLTextAreaElement;
 expect(description).toHaveValue("Tài liệu vận hành");
 expect(Array.from(description.labels ?? [], label => label.textContent).join(" ")).toBe("Mô tả");
});

test("paginates six documents at a time and resets when filtering", async () => {
 const entries = Array.from({ length: 7 }, (_, index) => ({ ...document, id: `doc-${index}`, title: `Tài liệu ${index + 1}` }));
 vi.mocked(api.get).mockImplementation(async (path) => {
  if (path.endsWith("/categories")) return [category];
  const url = new URL(path, "http://local.test");
  const offset = Number(url.searchParams.get("offset"));
  const limit = Number(url.searchParams.get("limit"));
  return { items: entries.slice(offset, offset + limit), total: entries.length };
 });
 render(<AdminLibrary initialCategories={[category]} initialDocuments={{ items: entries.slice(0, 6), total: 7 }} />);
 const list = within(screen.getByRole("region", { name: "Danh sách tài liệu" }));
 expect(list.getAllByRole("button", { name: /^Tài liệu/ })).toHaveLength(6);
 fireEvent.click(list.getByRole("button", { name: "Sau" }));
 await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining("offset=6&limit=6")));
 expect(await list.findByRole("button", { name: "Tài liệu 7" })).toBeVisible();
 expect(list.queryByRole("button", { name: "Tài liệu 1" })).not.toBeInTheDocument();
 expect(list.getByRole("button", { name: "Sau" })).toBeDisabled();
 fireEvent.click(list.getByRole("button", { name: "Trước" }));
 expect(await list.findByRole("button", { name: "Tài liệu 1" })).toBeVisible();
 fireEvent.click(list.getByRole("button", { name: "Sau" }));
 expect(await list.findByRole("button", { name: "Tài liệu 7" })).toBeVisible();
 fireEvent.click(screen.getByRole("button", { name: /^Hướng dẫn/ }));
 await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining("categoryId=cat&query=&offset=0&limit=6")));
 expect(await list.findByRole("button", { name: "Tài liệu 1" })).toBeVisible();
 expect(list.getByText("Trang 1 / 2")).toBeVisible();
});
test("category slider exposes a named keyboard-accessible scroll area and controls", () => {
 setup();
 expect(screen.getByRole("region", { name: "Trượt danh mục" })).toHaveAttribute("tabindex", "0");
 expect(screen.getByRole("button", { name: "Trượt danh mục sang trái" })).toHaveAttribute("type", "button");
 expect(screen.getByRole("button", { name: "Trượt danh mục sang phải" })).toHaveAttribute("type", "button");
});
