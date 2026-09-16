import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import Page from "../app/admin/library/page";
import AdminPage from "../app/admin/page";
import { SiteNavigation } from "../components/site-navigation";
import { optionalSession, privateGet } from "../lib/session";
vi.mock("../lib/session", () => ({ optionalSession: vi.fn(), privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, usePathname: () => "/admin/library", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => vi.resetAllMocks());
test.each([null, "USER", "MODERATOR"] as const)("role %s cannot SSR-load protected library", async (role) => {
  vi.mocked(optionalSession).mockResolvedValue(role ? { id: "u", email: "u@example.test", role } : null);
  await expect(Page({})).rejects.toThrow("redirect:/");
  expect(privateGet).not.toHaveBeenCalled();
});
test("ADMIN loads library and admin root redirects to library", async () => {
  vi.mocked(optionalSession).mockResolvedValue({ id: "a", email: "a@example.test", role: "ADMIN" });
  vi.mocked(privateGet).mockImplementation(async (path) => path.endsWith("categories") ? [] : { items: [], total: 0 });
  render(await Page({}));
  expect(privateGet).toHaveBeenCalledWith("/admin/library/documents?offset=0&limit=6");
  expect(screen.getByRole("heading", { name: "Thư viện website" })).toBeVisible();
  await expect(AdminPage()).rejects.toThrow("redirect:/admin/library");
});
test.each(["USER", "MODERATOR", "ADMIN"] as const)("navigation exposes admin link only to ADMIN (%s)", (role) => {
  render(<SiteNavigation session={{ id: "u", email: "u@example.test", role }} />);
  if (role === "ADMIN") expect(screen.getByRole("link", { name: "Quản trị website" })).toHaveAttribute("aria-current", "page");
  else expect(screen.queryByRole("link", { name: "Quản trị website" })).not.toBeInTheDocument();
});
