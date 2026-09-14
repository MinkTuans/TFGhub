import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";
import { DonateForm } from "../components/donate-form";
import { ReportForm } from "../components/report-form";
import { ReleaseForm } from "../components/release-form";

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

test("release form asks for a zip before calling the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(
    <ReleaseForm
      game={{
        id: "game-1",
        slug: "orbit-orchard",
        title: "Orbit Orchard",
        description: "",
        visibility: "DRAFT",
        accessMode: "GUEST_ALLOWED",
        moderationState: "CLEAR",
        createdAt: "2026-09-05T12:00:00.000Z",
        updatedAt: "2026-09-05T12:00:00.000Z",
      }}
    />,
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload and scan" }).closest("form")!,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a .zip HTML5 build.");
  expect(fetch).not.toHaveBeenCalled();
});

test("donation form rejects amounts under one dollar before calling the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DonateForm slug="orbit-orchard" />);
  fireEvent.change(screen.getByLabelText("Sandbox donation (USD)"), {
    target: { value: "0.50" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Send sandbox donation" }).closest("form")!,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter at least $1.00 (sandbox USD).",
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("report form rejects short evidence before calling the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ReportForm slug="orbit-orchard" />);
  fireEvent.change(screen.getByLabelText("Evidence"), {
    target: { value: "short" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Submit report" }).closest("form")!,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose a category and describe the issue in at least 8 characters.",
  );
  expect(fetch).not.toHaveBeenCalled();
});
