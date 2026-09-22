import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import RootLayout from "../app/layout";
import { TfgLogo } from "../components/tfg-logo";
import { SiteNavigation } from "../components/site-navigation";
import { ThemeToggle } from "../components/theme-toggle";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => route.pathname,
}));

vi.mock("../lib/session", () => ({
  optionalSession: vi.fn(async () => null),
}));

const globalStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

afterEach(() => {
  route.pathname = "/";
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
});

test.each([
  ["/", "Trang chủ"],
  ["/discover", "Khám phá"],
  ["/studio", "Xưởng sáng tạo"],
  ["/studio/games/new", "Xưởng sáng tạo"],
  ["/studio/games/game-1", "Xưởng sáng tạo"],
  ["/profile", "Hồ sơ"],
  ["/moderation", "Kiểm duyệt"],
])("marks the current navigation page at %s", (pathname, label) => {
  route.pathname = pathname;
  render(<SiteNavigation session={{ id: "admin", email: "admin@example.test", role: "ADMIN" }} />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
});

test("updates current navigation on route changes without matching partial prefixes", () => {
  route.pathname = "/";
  const { rerender } = render(<SiteNavigation session={null} />);
  route.pathname = "/discover";
  rerender(<SiteNavigation session={null} />);
  expect(screen.getByRole("link", { name: "Khám phá" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Trang chủ" })).not.toHaveAttribute("aria-current");
  route.pathname = "/discovery";
  rerender(<SiteNavigation session={null} />);
  expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
});

test.each([null, "USER", "MODERATOR", "ADMIN"] as const)("preserves navigation authorization for %s", (role) => {
  route.pathname = "/moderation";
  render(<SiteNavigation session={role ? { id: "user", email: "user@example.test", role } : null} />);
  expect(screen.queryByRole("link", { name: "Xưởng sáng tạo" }) !== null).toBe(role !== null);
  expect(screen.queryByRole("link", { name: "Hồ sơ" }) !== null).toBe(role !== null);
  expect(screen.queryByRole("link", { name: "Kiểm duyệt" }) !== null).toBe(role === "MODERATOR" || role === "ADMIN");
  expect(screen.queryByRole("link", { current: "page" }) !== null).toBe(role === "MODERATOR" || role === "ADMIN");
});

test("renders the accessible TFG monogram and Vietnamese guest navigation", () => {
  render(
    <>
      <TfgLogo />
      <SiteNavigation session={null} />
    </>,
  );

  expect(screen.getByRole("img", { name: "TFG" })).toBeVisible();
  const navigation = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(navigation).getByRole("link", { name: "Trang chủ" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(within(navigation).getByRole("link", { name: "Khám phá" })).toHaveAttribute(
    "href",
    "/discover",
  );
  expect(within(navigation).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
    "href",
    "/login",
  );
});

test("suppresses the expected root hydration warning from the theme bootstrap", async () => {
  const layout = await RootLayout({ children: <main>Trang chủ</main> });

  expect(layout.props.suppressHydrationWarning).toBe(true);
});

test("renders the one-time demo introduction from RootLayout", async () => {
  render(await RootLayout({ children: <main>Trang chủ</main> }));

  expect(await screen.findByRole("dialog", { name: "Giới thiệu TFG" })).toBeVisible();
});

test("keeps form boundaries on the dedicated high-contrast control token", () => {
  expect(globalStyles.match(/--control-border:/g)).toHaveLength(3);
  expect(globalStyles).toMatch(
    /input, textarea, select \{[\s\S]*?border: 1px solid var\(--control-border\);/,
  );
});

test("uses distinct semantic tokens for skeleton shimmer", () => {
  expect(globalStyles.match(/--skeleton-base:/g)).toHaveLength(3);
  expect(globalStyles.match(/--skeleton-highlight:/g)).toHaveLength(3);
  expect(globalStyles).toMatch(
    /\.skeleton \{[\s\S]*?var\(--skeleton-base\)[\s\S]*?var\(--skeleton-highlight\)/,
  );
});

test("shows creator links to a signed-in user without moderation", () => {
  render(
    <SiteNavigation
      session={{ id: "user-1", email: "creator@example.test", role: "USER" }}
    />,
  );

  expect(screen.getByRole("link", { name: "Xưởng sáng tạo" })).toHaveAttribute(
    "href",
    "/studio",
  );
  expect(screen.getByRole("link", { name: "Hồ sơ" })).toHaveAttribute(
    "href",
    "/profile",
  );
  expect(screen.queryByRole("link", { name: "Kiểm duyệt" })).not.toBeInTheDocument();
});

test("shows moderation only to moderators and administrators", () => {
  render(
    <SiteNavigation
      session={{ id: "moderator-1", email: "moderator@example.test", role: "MODERATOR" }}
    />,
  );

  expect(screen.getByRole("link", { name: "Kiểm duyệt" })).toHaveAttribute(
    "href",
    "/moderation",
  );
});

test("cycles theme preference and updates the accessible button label", () => {
  render(<ThemeToggle />);
  const button = screen.getByRole("button", { name: "Giao diện: mặc định TFG" });

  fireEvent.click(button);
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("tfg-theme")).toBe("light");
  expect(screen.getByRole("button", { name: "Giao diện: sáng" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: sáng" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("tfg-theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "Giao diện: tối" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: tối" }));
  expect(document.documentElement).not.toHaveAttribute("data-theme");
  expect(localStorage.getItem("tfg-theme")).toBe("system");
  expect(screen.getByRole("button", { name: "Giao diện: mặc định TFG" })).toBeVisible();
});

test("cycles from the theme selected by the pre-paint bootstrap", () => {
  document.documentElement.dataset.theme = "dark";
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: tối" }));

  expect(document.documentElement).not.toHaveAttribute("data-theme");
  expect(localStorage.getItem("tfg-theme")).toBe("system");
  expect(screen.getByRole("button", { name: "Giao diện: mặc định TFG" })).toBeVisible();
});

test("announces the theme selected by the pre-paint bootstrap", async () => {
  document.documentElement.dataset.theme = "dark";
  render(<ThemeToggle />);

  expect(await screen.findByRole("button", { name: "Giao diện: tối" })).toBeVisible();
});

test("changes the theme when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is unavailable", "SecurityError");
  });
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: mặc định TFG" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("mobile navigation closes with Escape and returns focus to the trigger", () => {
  render(<SiteNavigation session={null} />);
  const toggle = screen.getByRole("button", { name: "Mở trình đơn điều hướng" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const discover = screen.getByRole("link", { name: "Khám phá" });
  discover.focus();
  fireEvent.keyDown(discover, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
});

test("mobile navigation closes after choosing a route", () => {
  render(<SiteNavigation session={null} />);
  const toggle = screen.getByRole("button", { name: "Mở trình đơn điều hướng" });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("link", { name: "Khám phá" }));
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("does not reopen the mobile menu when returning through browser history", () => {
  const { rerender } = render(<SiteNavigation session={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Mở trình đơn điều hướng" }));
  route.pathname = "/discover";
  rerender(<SiteNavigation session={null} />);
  expect(screen.getByRole("button", { name: "Mở trình đơn điều hướng" })).toHaveAttribute("aria-expanded", "false");
  route.pathname = "/";
  rerender(<SiteNavigation session={null} />);
  expect(screen.getByRole("button", { name: "Mở trình đơn điều hướng" })).toHaveAttribute("aria-expanded", "false");
});
