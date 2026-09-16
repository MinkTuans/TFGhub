import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function fillRegistration(confirm = "password123") {
  fireEvent.change(screen.getByLabelText("Tên hiển thị"), { target: { value: "Minh" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "minh@example.test" } });
  fireEvent.change(screen.getByLabelText("Mật khẩu", { exact: true }), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: confirm } });
  fireEvent.submit(screen.getByRole("button", { name: "Tạo tài khoản" }).closest("form")!);
}

test("password visibility preserves the entered password", () => {
  render(<AuthForm mode="login" />);
  const password = screen.getByLabelText("Mật khẩu", { exact: true });
  fireEvent.change(password, { target: { value: "private-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("private-password");
  fireEvent.click(screen.getByRole("button", { name: "Ẩn mật khẩu" }));
  expect(password).toHaveAttribute("type", "password");
});

test("registration rejects mismatched confirmation before making requests", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<AuthForm mode="register" />);
  fillRegistration("different-password");
  expect(screen.getByRole("alert")).toHaveTextContent("Mật khẩu xác nhận chưa khớp.");
  expect(fetch).not.toHaveBeenCalled();
});

test("registration sends only auth fields to auth and then saves the display name", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<AuthForm mode="register" />);
  fillRegistration();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/studio"));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/register$/);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: "minh@example.test", password: "password123" });
  expect(fetch.mock.calls[1][0]).toMatch(/\/developers\/me$/);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ displayName: "Minh", bio: "" });
});

test("a profile-save retry never repeats successful account creation", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "unavailable" }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ displayName: "Minh", bio: "" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<AuthForm mode="register" />);
  fillRegistration();
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể lưu hồ sơ");
  expect(screen.getByRole("status")).toHaveTextContent("Tài khoản đã được tạo");
  expect(screen.queryByLabelText("Mật khẩu", { exact: true })).not.toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole("button", { name: "Thử lưu hồ sơ" }).closest("form")!);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/studio"));
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/auth/register"))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/developers/me"))).toHaveLength(2);
});
