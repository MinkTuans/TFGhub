import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import UsersPage from "../app/admin/users/page";
import GamesPage from "../app/admin/games/page";
import AdminPage from "../app/admin/page";
import { optionalSession, privateGet } from "../lib/session";
vi.mock("../lib/session", () => ({ optionalSession: vi.fn(), privateGet: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, usePathname: () => "/admin" }));
beforeEach(() => vi.resetAllMocks());
test.each([null, "USER", "MODERATOR"] as const)("role %s cannot load management data", async role => {
 vi.mocked(optionalSession).mockResolvedValue(role ? { id: "u", email: "u@example.test", role } : null);
 for (const page of [AdminPage, UsersPage, GamesPage]) await expect(page()).rejects.toThrow("redirect:/");
 expect(privateGet).not.toHaveBeenCalled();
});
test("ADMIN gets both management lists with ten rows per page", async () => {
 vi.mocked(optionalSession).mockResolvedValue({ id: "a", email: "a@example.test", role: "ADMIN" });
 vi.mocked(privateGet).mockResolvedValue({ items: [], total: 0 });
 render(await UsersPage()); render(await GamesPage());
 expect(screen.getByRole("heading", { name: "Quản lý người dùng" })).toBeVisible();
 expect(screen.getByRole("heading", { name: "Quản lý game" })).toBeVisible();
 expect(privateGet).toHaveBeenCalledWith("/admin/users?offset=0&limit=10");
 expect(privateGet).toHaveBeenCalledWith("/admin/games?offset=0&limit=10");
});
