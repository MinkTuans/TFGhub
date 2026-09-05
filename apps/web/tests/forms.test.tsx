import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";

// Navigation needs a Next router; the form, validation and HTTP client stay real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

test("registration reports the API conflict and permits another attempt", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
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
    vi
      .fn()
      .mockResolvedValue(
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
