"use client";

import { useRef, useState } from "react";
import {
  PlatformerProjectInput,
  type GameSummary,
  type PlatformerProjectInput as PlatformerProject,
} from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

type Platform = PlatformerProject["platforms"][number] & { key: string };

const defaultProject: PlatformerProject = {
  sourceType: "PLATFORMER",
  canvas: { width: 640, height: 480 },
  backgroundColor: "#111827",
  player: { x: 24, y: 0, color: "#2563eb" },
  goal: { x: 300, y: 416, color: "#16a34a" },
  platforms: [{ x: 0, y: 440, width: 640, height: 40, color: "#6b7280" }],
};

function savedProject(
  projectData: GameSummary["projectData"],
): PlatformerProject {
  const parsed = PlatformerProjectInput.safeParse(projectData);
  return parsed.success ? parsed.data : defaultProject;
}

function withKeys(project: PlatformerProject): Platform[] {
  return project.platforms.map((platform, index) => ({
    ...platform,
    key: `platform-${index}`,
  }));
}

function errorMessage(error: unknown): string {
  return apiErrorMessage(
    error,
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
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
  const nextKey = useRef(0);
  const [canvas, setCanvas] = useState(initial.canvas);
  const [backgroundColor, setBackgroundColor] = useState(
    initial.backgroundColor,
  );
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
        key: `platform-added-${nextKey.current++}`,
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
      setError(
        parsed.error.issues[0]?.message ===
          "Platform geometry must be inside the canvas"
          ? "Nền tảng phải nằm trong khung vẽ."
          : "Kiểm tra khung vẽ, nhân vật, đích đến và các nền tảng.",
      );
      return;
    }
    setOperation("save");
    try {
      const game = await api.put<GameSummary>(
        `/games/${gameId}/project`,
        parsed.data,
      );
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
    <section
      className="panel editor-panel"
      aria-labelledby="platformer-editor-heading"
    >
      <h2 id="platformer-editor-heading">Trình tạo trò chơi đi cảnh</h2>
      <div className="form-stack">
        <fieldset>
          <legend>Khung vẽ</legend>
          <label>
            Chiều rộng khung vẽ
            <input
              disabled={operation !== null}
              max={1920}
              min={320}
              onChange={(event) =>
                setCanvas((current) => ({
                  ...current,
                  width: Number(event.target.value),
                }))
              }
              type="number"
              value={canvas.width}
            />
          </label>
          <label>
            Chiều cao khung vẽ
            <input
              disabled={operation !== null}
              max={1080}
              min={240}
              onChange={(event) =>
                setCanvas((current) => ({
                  ...current,
                  height: Number(event.target.value),
                }))
              }
              type="number"
              value={canvas.height}
            />
          </label>
          <label>
            Màu nền
            <input
              disabled={operation !== null}
              onChange={(event) => setBackgroundColor(event.target.value)}
              type="color"
              value={backgroundColor}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Nhân vật</legend>
          <label>
            Vị trí X nhân vật
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setPlayer((current) => ({
                  ...current,
                  x: Number(event.target.value),
                }))
              }
              type="number"
              value={player.x}
            />
          </label>
          <label>
            Vị trí Y nhân vật
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setPlayer((current) => ({
                  ...current,
                  y: Number(event.target.value),
                }))
              }
              type="number"
              value={player.y}
            />
          </label>
          <label>
            Màu nhân vật
            <input
              disabled={operation !== null}
              onChange={(event) =>
                setPlayer((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
              type="color"
              value={player.color}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Đích đến</legend>
          <label>
            Vị trí X đích đến
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setGoal((current) => ({
                  ...current,
                  x: Number(event.target.value),
                }))
              }
              type="number"
              value={goal.x}
            />
          </label>
          <label>
            Vị trí Y đích đến
            <input
              disabled={operation !== null}
              min={0}
              onChange={(event) =>
                setGoal((current) => ({
                  ...current,
                  y: Number(event.target.value),
                }))
              }
              type="number"
              value={goal.y}
            />
          </label>
          <label>
            Màu đích đến
            <input
              disabled={operation !== null}
              onChange={(event) =>
                setGoal((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
              type="color"
              value={goal.color}
            />
          </label>
        </fieldset>
        {platforms.map((platform, index) => (
          <fieldset key={platform.key}>
            <legend>Nền tảng {index + 1}</legend>
            <label>
              X
              <input
                disabled={operation !== null}
                min={0}
                onChange={(event) =>
                  updatePlatform(platform.key, {
                    x: Number(event.target.value),
                  })
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
                  updatePlatform(platform.key, {
                    y: Number(event.target.value),
                  })
                }
                type="number"
                value={platform.y}
              />
            </label>
            <label>
              Chiều rộng
              <input
                disabled={operation !== null}
                min={1}
                onChange={(event) =>
                  updatePlatform(platform.key, {
                    width: Number(event.target.value),
                  })
                }
                type="number"
                value={platform.width}
              />
            </label>
            <label>
              Chiều cao
              <input
                disabled={operation !== null}
                min={1}
                onChange={(event) =>
                  updatePlatform(platform.key, {
                    height: Number(event.target.value),
                  })
                }
                type="number"
                value={platform.height}
              />
            </label>
            <label>
              Màu sắc
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
              Xóa nền tảng
            </button>
          </fieldset>
        ))}
        <button
          disabled={operation !== null || platforms.length >= 100}
          onClick={addPlatform}
          type="button"
        >
          Thêm nền tảng
        </button>
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button
            disabled={operation !== null}
            onClick={savePlatformer}
            type="button"
          >
            {operation === "save" ? "Đang lưu…" : "Lưu trò chơi đi cảnh"}
          </button>
          <button
            disabled={operation !== null || !hasSavedProject || isDirty}
            onClick={buildPreview}
            type="button"
          >
            {operation === "build" ? "Đang tạo…" : "Tạo bản chơi thử"}
          </button>
        </div>
      </div>
    </section>
  );
}
