import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MobileNavigation } from "../components/mobile-navigation";
vi.mock("next/navigation", () => ({ usePathname: () => "/studio/games/new" }));
test("mobile navigation keeps primary routes reachable and marks nested Studio routes", () => {
  render(<MobileNavigation authenticated={false} />);
  const nav = within(screen.getByRole("navigation", { name: "Điều hướng nhanh" }));
  expect(nav.getByRole("link", { name: "Studio" })).toHaveAttribute("aria-current", "page");
  expect(nav.getByRole("link", { name: "Trang chủ" })).not.toHaveAttribute("aria-current");
  expect(nav.getByRole("link", { name: "Tài khoản" })).toHaveAttribute("href", "/login");
});
test("signed-in creators reach their own profile from mobile navigation", () => {
  render(<MobileNavigation authenticated />);
  expect(screen.getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("href", "/profile");
});
