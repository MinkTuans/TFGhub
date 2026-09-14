import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthForm } from "../components/auth-form";
import { GameForm } from "../components/game-form";
import { DonateForm } from "../components/donate-form";
import { ReportForm } from "../components/report-form";
import { ReleaseForm } from "../components/release-form";
import { EngineForm } from "../components/engine-form";

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

const engineProject = {
  id: "proj-1",
  gameId: "game-1",
  templateId: "phaser3-starter",
  formatVersion: "1",
  document: {
    engine: "phaser3" as const,
    engineVersion: "3.80.1",
    formatVersion: "1" as const,
    entryScene: "Main",
    scenes: [
      {
        id: "Main",
        width: 800,
        height: 600,
        background: "#1b2838",
        objects: [
          {
            id: "player",
            type: "rectangle" as const,
            x: 376,
            y: 276,
            width: 48,
            height: 48,
            color: "#66c0f4",
            bounce: true,
          },
        ],
      },
    ],
  },
  createdAt: "2026-09-14T03:00:00.000Z",
  updatedAt: "2026-09-14T03:00:00.000Z",
};

test("engine form creates a starter project when none exists", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 404 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(engineProject), { status: 201 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ html: "<html>preview</html>" }), {
        status: 200,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<EngineForm gameId="game-1" />);
  expect(await screen.findByLabelText("Player color")).toHaveValue("#66c0f4");
  expect(String(fetch.mock.calls[1]?.[1]?.method)).toBe("POST");
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
    template: "phaser3-starter",
  });
});

test("engine form saves player edits", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(engineProject), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ html: "<html>preview</html>" }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...engineProject,
          document: {
            ...engineProject.document,
            scenes: [
              {
                ...engineProject.document.scenes[0],
                objects: [
                  {
                    ...engineProject.document.scenes[0].objects[0],
                    color: "#ff8800",
                  },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ html: "<html>saved</html>" }), {
        status: 200,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<EngineForm gameId="game-1" />);
  fireEvent.change(await screen.findByLabelText("Player color"), {
    target: { value: "#ff8800" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save project" }).closest("form")!,
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Project saved.");
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

test("release form does not offer rollback on a draft", () => {
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
      versions={[
        {
          id: "ver-1",
          gameId: "game-1",
          status: "READY",
          filename: "orbit.zip",
          byteSize: 12,
          checksumSha256: "a".repeat(64),
          findings: "",
          createdAt: "2026-09-05T12:00:00.000Z",
        },
      ]}
    />,
  );
  expect(screen.queryByText("Previous READY builds")).toBeNull();
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
