import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteFooter } from "../components/site-footer";

test.each([null, "USER", "MODERATOR", "ADMIN"] as const)("footer exposes only relevant routes for %s", (role) => {
  render(<SiteFooter session={role ? { id: "user", email: "user@example.test", role } : null} />);
  const footer = within(screen.getByRole("contentinfo"));
  expect(footer.getByRole("link", { name: "Khám phá game" })).toHaveAttribute("href", "/discover");
  expect(footer.getByRole("link", { name: "Xưởng sáng tạo" })).toHaveAttribute("href", "/studio");
  expect(footer.queryByRole("link", { name: "Kiểm duyệt" }) !== null).toBe(role === "MODERATOR" || role === "ADMIN");
  expect(footer.getByRole("link", { name: role ? "Hồ sơ của bạn" : "Tạo tài khoản" })).toHaveAttribute("href", role ? "/profile" : "/register");
});
