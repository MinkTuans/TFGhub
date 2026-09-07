import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";
import { LogoutButton } from "../components/logout-button";

// Navigation needs a Next router; the form, validation and HTTP client stay real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

test.each(["register", "login"] as const)(
  "%s rejects invalid credentials before sending an HTTP request",
  (mode) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<AuthForm mode={mode} />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  },
);

test("registration reports the API conflict and permits another attempt", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Email already registered" }), {
        status: 409,
      }),
    ),
  );
  render(<AuthForm mode="register" />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "me@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Create account" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Email already registered",
  );
  expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("draft creation keeps input visible after a duplicate slug rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Game slug already exists" }), {
        status: 409,
      }),
    ),
  );
  render(<GameForm />);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "My game" },
  });
  fireEvent.change(screen.getByLabelText("Slug"), {
    target: { value: "my-game" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Create draft" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Game slug already exists",
  );
  expect(screen.getByLabelText("Title")).toHaveValue("My game");
  expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled();
});

test("logout reports a network failure and permits another attempt", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  render(<LogoutButton />);

  fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể đăng xuất. Vui lòng thử lại.",
  );
  expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeEnabled();
});
