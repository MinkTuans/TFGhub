"use client";

import { useState } from "react";
import {
  PlatformerProjectInput,
  type GameSummary,
  type PlatformerProjectInput as PlatformerProject,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

type Platform = PlatformerProject["platforms"][number] & { key: string };

const defaultProject: PlatformerProject = {
  sourceType: "PLATFORMER",
  canvas: { width: 640, height: 480 },
  backgroundColor: "#111827",
  player: { x: 24, y: 0, color: "#2563eb" },
  goal: { x: 300, y: 416, color: "#16a34a" },
  platforms: [
    { x: 0, y: 440, width: 640, height: 40, color: "#6b7280" },
  ],
};

function uiKey(): string {
  return globalThis.crypto.randomUUID();
}

function savedProject(projectData: GameSummary["projectData"]): PlatformerProject {
  const parsed = PlatformerProjectInput.safeParse(projectData);
  return parsed.success ? parsed.data : defaultProject;
}

function withKeys(project: PlatformerProject): Platform[] {
  return project.platforms.map((platform) => ({ ...platform, key: uiKey() }));
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Unable to connect. Please try again.";
}

export function PlatformerGameEditor({
  gameId,
  initialProject,
  onSaved,
  onBuilt,
}: {
  gameId: string;
  initialProject: GameSummary["projectData"];
  onSaved: (game: GameSummary) => void;
  onBuilt: (game: GameSummary) => void;
}) {
  const initial = savedProject(initialProject);
  const [canvas, setCanvas] = useState(initial.canvas);
  const [backgroundColor, setBackgroundColor] = useState(initial.backgroundColor);
  const [player, setPlayer] = useState(initial.player);
  const [goal, setGoal] = useState(initial.goal);
  const [platforms, setPlatforms] = useState(() => withKeys(initial));
  const [saved, setSaved] = useState(initial);
  const [hasSavedProject, setHasSavedProject] = useState(
    PlatformerProjectInput.safeParse(initialProject).success,
  );
  const [operation, setOperation] = useState<"save" | "build" | null>(null);
  const [error, setError] = useState("");
  const project: PlatformerProject = {
    sourceType: "PLATFORMER",
    canvas,
    backgroundColor,
    player,
    goal,
    platforms: platforms.map((platform) => ({
      x: platform.x,
      y: platform.y,
      width: platform.width,
      height: platform.height,
      color: platform.color,
    })),
  };
  const isDirty = JSON.stringify(project) !== JSON.stringify(saved);

  function updatePlatform(key: string, update: Partial<Platform>) {
    setPlatforms((current) =>
      current.map((platform) =>
        platform.key === key ? { ...platform, ...update } : platform,
      ),
    );
  }

  function addPlatform() {
    setPlatforms((current) => [
      ...current,
      {
        key: uiKey(),
        x: 0,
        y: Math.max(0, canvas.height - 40),
        width: Math.min(160, canvas.width),
        height: 40,
        color: "#6b7280",
      },
    ]);
  }

  async function savePlatformer() {
    setError("");
    const parsed = PlatformerProjectInput.safeParse(project);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your platformer.");
      return;
    }
    setOperation("save");
    try {
      const game = await api.put<GameSummary>(`/games/${gameId}/project`, parsed.data);
      setSaved(parsed.data);
      setHasSavedProject(true);
      onSaved(game);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setOperation(null);
    }
  }

  async function buildPreview() {
    setError("");
    setOperation("build");
    try {
      onBuilt(await api.post<GameSummary>(`/games/${gameId}/build`, {}));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setOperation(null);
    }
  }

  return (
    <section aria-labelledby="platformer-editor-heading">
      <h2 id="platformer-editor-heading">Platformer editor</h2>
      <div className="form-stack">
        <fieldset>
          <legend>Canvas</legend>
          <label>
            Canvas width
            <input
              disabled={operation !== null}
              max={1920}
              min={320}
              onChange={(event) =>
                setCanvas((current) => ({ ...current, width: Number(event.target.value) }))
              }
              type="number"
              value={canvas.width}
            />
          </label>
          <label>
            Canvas height
            <input
              disabled={operation !== null}
              max={1080}
              min={240}
              onChange={(event) =>
                setCanvas((current) => ({ ...current, height: Number(event.target.value) }))
              }
              type="number"
              value={canvas.height}
            />
          </label>
          <label>
            Background color
            <input
              disabled={operation !== null}
              onChange={(event) => setBackgroundColor(event.target.value)}
              type="color"
              value={backgroundColor}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Player</legend>
          <label>
            Player X
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setPlayer((current) => ({ ...current, x: Number(event.target.value) }))
              }
              type="number"
              value={player.x}
            />
          </label>
          <label>
            Player Y
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setPlayer((current) => ({ ...current, y: Number(event.target.value) }))
              }
              type="number"
              value={player.y}
            />
          </label>
          <label>
            Player color
            <input
              disabled={operation !== null}
              onChange={(event) =>
                setPlayer((current) => ({ ...current, color: event.target.value }))
              }
              type="color"
              value={player.color}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Goal</legend>
          <label>
            Goal X
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setGoal((current) => ({ ...current, x: Number(event.target.value) }))
              }
              type="number"
              value={goal.x}
            />
          </label>
          <label>
            Goal Y
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setGoal((current) => ({ ...current, y: Number(event.target.value) }))
              }
              type="number"
              value={goal.y}
            />
          </label>
          <label>
            Goal color
            <input
              disabled={operation !== null}
              onChange={(event) =>
                setGoal((current) => ({ ...current, color: event.target.value }))
              }
              type="color"
              value={goal.color}
            />
          </label>
        </fieldset>
        {platforms.map((platform, index) => (
          <fieldset key={platform.key}>
            <legend>Platform {index + 1}</legend>
            <label>
              X
              <input
                disabled={operation !== null}
                min={0}
                onChange={(event) =>
                  updatePlatform(platform.key, { x: Number(event.target.value) })
                }
                type="number"
                value={platform.x}
              />
            </label>
            <label>
              Y
              <input
                disabled={operation !== null}
                min={0}
                onChange={(event) =>
                  updatePlatform(platform.key, { y: Number(event.target.value) })
                }
                type="number"
                value={platform.y}
              />
            </label>
            <label>
              Width
              <input
                disabled={operation !== null}
                min={1}
                onChange={(event) =>
                  updatePlatform(platform.key, { width: Number(event.target.value) })
                }
                type="number"
                value={platform.width}
              />
            </label>
            <label>
              Height
              <input
                disabled={operation !== null}
                min={1}
                onChange={(event) =>
                  updatePlatform(platform.key, { height: Number(event.target.value) })
                }
                type="number"
                value={platform.height}
              />
            </label>
            <label>
              Color
              <input
                disabled={operation !== null}
                onChange={(event) =>
                  updatePlatform(platform.key, { color: event.target.value })
                }
                type="color"
                value={platform.color}
              />
            </label>
            <button
              disabled={operation !== null}
              onClick={() =>
                setPlatforms((current) =>
                  current.filter((candidate) => candidate.key !== platform.key),
                )
              }
              type="button"
            >
              Remove platform
            </button>
          </fieldset>
        ))}
        <button
          disabled={operation !== null || platforms.length >= 100}
          onClick={addPlatform}
          type="button"
        >
          Add platform
        </button>
        {error && <p role="alert">{error}</p>}
        <button disabled={operation !== null} onClick={savePlatformer} type="button">
          {operation === "save" ? "Saving…" : "Save platformer"}
        </button>
        <button
          disabled={operation !== null || !hasSavedProject || isDirty}
          onClick={buildPreview}
          type="button"
        >
          {operation === "build" ? "Building…" : "Build preview"}
        </button>
      </div>
    </section>
  );
}
