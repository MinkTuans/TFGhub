import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TfgLogo } from "../components/tfg-logo";
import { SiteNavigation } from "../components/site-navigation";
import { ThemeToggle } from "../components/theme-toggle";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
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
  const button = screen.getByRole("button", { name: "Giao diện: theo hệ thống" });

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
  expect(screen.getByRole("button", { name: "Giao diện: theo hệ thống" })).toBeVisible();
});

test("cycles from the theme selected by the pre-paint bootstrap", () => {
  document.documentElement.dataset.theme = "dark";
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: tối" }));

  expect(document.documentElement).not.toHaveAttribute("data-theme");
  expect(localStorage.getItem("tfg-theme")).toBe("system");
  expect(screen.getByRole("button", { name: "Giao diện: theo hệ thống" })).toBeVisible();
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

  fireEvent.click(screen.getByRole("button", { name: "Giao diện: theo hệ thống" }));

  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
