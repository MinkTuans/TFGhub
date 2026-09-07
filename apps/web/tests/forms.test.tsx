import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";
import { GameWorkspace } from "../components/game-workspace";
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

test("draft creation submits the selected source type", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "game-1" })));
  vi.stubGlobal("fetch", fetch);
  render(<GameForm />);

  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Upload quest" },
  });
  fireEvent.change(screen.getByLabelText("Slug"), {
    target: { value: "upload-quest" },
  });
  fireEvent.change(screen.getByLabelText("Source type"), {
    target: { value: "UPLOAD" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Create draft" }).closest("form")!,
  );

  await screen.findByRole("button", { name: "Create draft" });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    sourceType: "UPLOAD",
  });
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

test("workspace shows a moderator rejection note to its owner", () => {
  render(
    <GameWorkspace
      initialGame={{
        id: "game-1",
        slug: "upload-quest",
        title: "Upload quest",
        description: "",
        visibility: "DRAFT",
        accessMode: "GUEST_ALLOWED",
        moderationState: "CLEAR",
        sourceType: "UPLOAD",
        reviewState: "REJECTED",
        projectData: null,
        artifactVersion: 1,
        reviewNote: "Please remove the copyrighted artwork.",
        submittedAt: "2026-09-07T08:00:00.000Z",
        reviewedAt: "2026-09-07T09:00:00.000Z",
        createdAt: "2026-09-07T07:00:00.000Z",
        updatedAt: "2026-09-07T09:00:00.000Z",
      }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Please remove the copyrighted artwork.",
  );
});
