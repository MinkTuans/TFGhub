import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";
import { GameWorkspace } from "../components/game-workspace";
import { LogoutButton } from "../components/logout-button";
import type { GameSummary } from "@indieforge/contracts";

// Navigation needs a Next router; the form, validation and HTTP client stay real.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

function codeGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "game-1",
    slug: "code-quest",
    title: "Code quest",
    description: "",
    visibility: "DRAFT",
    accessMode: "GUEST_ALLOWED",
    moderationState: "CLEAR",
    sourceType: "CODE",
    reviewState: "DRAFT",
    projectData: {
      sourceType: "CODE",
      html: "<h1>Saved quest</h1>",
      css: "h1 { color: rebeccapurple; }",
      javascript: "window.saved = true;",
    },
    artifactVersion: 1,
    artifactReady: true,
    reviewNote: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: "2026-09-07T07:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

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
        artifactReady: true,
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

test("code editor loads saved HTML, CSS, and JavaScript", () => {
  render(<GameWorkspace initialGame={codeGame()} />);

  expect(screen.getByLabelText("HTML")).toHaveValue("<h1>Saved quest</h1>");
  expect(screen.getByLabelText("CSS")).toHaveValue(
    "h1 { color: rebeccapurple; }",
  );
  expect(screen.getByLabelText("JavaScript")).toHaveValue(
    "window.saved = true;",
  );
});

test("workspace disables submission after reloading a persisted unready artifact", () => {
  const reloaded = { ...codeGame(), artifactReady: false } as GameSummary;
  render(<GameWorkspace initialGame={reloaded} />);

  expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
});

test("code editor preserves edits after a failed source save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Source could not be saved" }), {
        status: 503,
      }),
    ),
  );
  render(<GameWorkspace initialGame={codeGame()} />);

  fireEvent.change(screen.getByLabelText("HTML"), {
    target: { value: "<h1>Edited quest</h1>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Source could not be saved",
  );
  expect(screen.getByLabelText("HTML")).toHaveValue("<h1>Edited quest</h1>");
});

test("code build refreshes the sandboxed preview and enables submission of its compiled revision", async () => {
  const saved = codeGame({
    artifactReady: false,
    projectData: {
      sourceType: "CODE",
      html: "<h1>Edited quest</h1>",
      css: "h1 { color: tomato; }",
      javascript: "window.edited = true;",
    },
  });
  const built = { ...saved, artifactVersion: 2, artifactReady: true };
  const submitted = { ...built, reviewState: "PENDING" as const };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
    .mockResolvedValueOnce(new Response(JSON.stringify(built)))
    .mockResolvedValueOnce(new Response(JSON.stringify(submitted)));
  vi.stubGlobal("fetch", fetch);
  render(<GameWorkspace initialGame={codeGame()} />);

  expect(screen.getByTitle("Game preview")).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=1",
  );
  fireEvent.change(screen.getByLabelText("HTML"), {
    target: { value: "<h1>Edited quest</h1>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
  await screen.findByRole("button", { name: "Build preview" });
  expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Build preview" }));
  const preview = await screen.findByTitle("Game preview");
  expect(preview).toHaveAttribute(
    "src",
    "http://localhost:3001/games/game-1/preview/?v=2",
  );
  expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Pending review");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "http://localhost:3001/games/game-1/project",
    "http://localhost:3001/games/game-1/build",
    "http://localhost:3001/games/game-1/submit",
  ]);
});
