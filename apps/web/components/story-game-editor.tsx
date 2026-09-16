"use client";

import { useRef, useState } from "react";
import {
  StoryProjectInput,
  type GameSummary,
  type StoryProjectInput as StoryProject,
} from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

type Choice = StoryProject["scenes"][number]["choices"][number] & {
  key: string;
};

type Scene = Omit<StoryProject["scenes"][number], "choices"> & {
  key: string;
  choices: Choice[];
};

const defaultProject: StoryProject = {
  sourceType: "STORY",
  startSceneId: "start",
  scenes: [
    {
      id: "start",
      speaker: "Người kể chuyện",
      dialogue: "Hãy bắt đầu câu chuyện của bạn.",
      backgroundColor: "#ffffff",
      choices: [],
    },
  ],
};

function savedProject(projectData: GameSummary["projectData"]): StoryProject {
  const parsed = StoryProjectInput.safeParse(projectData);
  return parsed.success ? parsed.data : defaultProject;
}

function toEditorScenes(project: StoryProject): Scene[] {
  return project.scenes.map((scene, sceneIndex) => ({
    ...scene,
    key: `scene-${sceneIndex}`,
    choices: scene.choices.map((choice, choiceIndex) => ({
      ...choice,
      key: `scene-${sceneIndex}-choice-${choiceIndex}`,
    })),
  }));
}

function toProject(startSceneId: string, scenes: Scene[]): StoryProject {
  return {
    sourceType: "STORY",
    startSceneId,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      speaker: scene.speaker,
      dialogue: scene.dialogue,
      backgroundColor: scene.backgroundColor,
      choices: scene.choices.map((choice) => ({
        text: choice.text,
        targetSceneId: choice.targetSceneId,
      })),
    })),
  };
}

function errorMessage(error: unknown): string {
  return apiErrorMessage(
    error,
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
}

export function StoryGameEditor({
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
  const addedKey = (kind: string) => `${kind}-added-${nextKey.current++}`;
  const [startSceneId, setStartSceneId] = useState(initial.startSceneId);
  const [scenes, setScenes] = useState(() => toEditorScenes(initial));
  const [saved, setSaved] = useState(initial);
  const [hasSavedProject, setHasSavedProject] = useState(
    StoryProjectInput.safeParse(initialProject).success,
  );
  const [operation, setOperation] = useState<"save" | "build" | null>(null);
  const [error, setError] = useState("");
  const project = toProject(startSceneId, scenes);
  const isDirty = JSON.stringify(project) !== JSON.stringify(saved);

  function updateScene(key: string, update: Partial<Scene>) {
    setScenes((current) =>
      current.map((scene) =>
        scene.key === key ? { ...scene, ...update } : scene,
      ),
    );
  }

  function addScene() {
    setScenes((current) => {
      let number = current.length + 1;
      while (current.some((scene) => scene.id === `scene-${number}`))
        number += 1;
      return [
        ...current,
        {
          key: addedKey("scene"),
          id: `scene-${number}`,
          speaker: "Người kể chuyện",
          dialogue: "",
          backgroundColor: "#ffffff",
          choices: [],
        },
      ];
    });
  }

  function removeScene(key: string) {
    setScenes((current) => current.filter((scene) => scene.key !== key));
  }

  function addChoice(sceneKey: string) {
    setScenes((current) =>
      current.map((scene) =>
        scene.key === sceneKey
          ? {
              ...scene,
              choices: [
                ...scene.choices,
                {
                  key: addedKey("choice"),
                  text: "Tiếp tục",
                  targetSceneId: current[0]?.id ?? "",
                },
              ],
            }
          : scene,
      ),
    );
  }

  function updateChoice(
    sceneKey: string,
    choiceKey: string,
    update: Partial<Choice>,
  ) {
    setScenes((current) =>
      current.map((scene) =>
        scene.key === sceneKey
          ? {
              ...scene,
              choices: scene.choices.map((choice) =>
                choice.key === choiceKey ? { ...choice, ...update } : choice,
              ),
            }
          : scene,
      ),
    );
  }

  function removeChoice(sceneKey: string, choiceKey: string) {
    setScenes((current) =>
      current.map((scene) =>
        scene.key === sceneKey
          ? {
              ...scene,
              choices: scene.choices.filter(
                (choice) => choice.key !== choiceKey,
              ),
            }
          : scene,
      ),
    );
  }

  async function saveStory() {
    setError("");
    const parsed = StoryProjectInput.safeParse(project);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message;
      setError(
        message === "Scene identifiers must be unique"
          ? "Mỗi cảnh phải có mã riêng."
          : message === "Choice targets must reference an existing scene"
            ? "Lựa chọn phải dẫn đến một cảnh có sẵn."
            : "Kiểm tra mã cảnh, lời thoại và các lựa chọn.",
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
      aria-labelledby="story-editor-heading"
    >
      <h2 id="story-editor-heading">Trình tạo cốt truyện</h2>
      <div className="form-stack">
        <label>
          Mã cảnh mở đầu
          <input
            disabled={operation !== null}
            maxLength={64}
            onChange={(event) => setStartSceneId(event.target.value)}
            required
            value={startSceneId}
          />
        </label>
        {scenes.map((scene, sceneIndex) => (
          <fieldset key={scene.key}>
            <legend>Cảnh {sceneIndex + 1}</legend>
            <label>
              Mã cảnh
              <input
                disabled={operation !== null}
                maxLength={64}
                onChange={(event) =>
                  updateScene(scene.key, { id: event.target.value })
                }
                required
                value={scene.id}
              />
            </label>
            <label>
              Người nói
              <input
                disabled={operation !== null}
                maxLength={80}
                onChange={(event) =>
                  updateScene(scene.key, { speaker: event.target.value })
                }
                value={scene.speaker}
              />
            </label>
            <label>
              Lời thoại
              <textarea
                disabled={operation !== null}
                maxLength={5_000}
                onChange={(event) =>
                  updateScene(scene.key, { dialogue: event.target.value })
                }
                rows={5}
                value={scene.dialogue}
              />
            </label>
            <label>
              Màu nền
              <input
                disabled={operation !== null}
                onChange={(event) =>
                  updateScene(scene.key, {
                    backgroundColor: event.target.value,
                  })
                }
                pattern="#[0-9a-fA-F]{6}"
                type="text"
                value={scene.backgroundColor}
              />
            </label>
            {scene.choices.map((choice, choiceIndex) => (
              <fieldset key={choice.key}>
                <legend>Lựa chọn {choiceIndex + 1}</legend>
                <label>
                  Nội dung lựa chọn
                  <input
                    disabled={operation !== null}
                    maxLength={200}
                    onChange={(event) =>
                      updateChoice(scene.key, choice.key, {
                        text: event.target.value,
                      })
                    }
                    required
                    value={choice.text}
                  />
                </label>
                <label>
                  Mã cảnh đích
                  <input
                    disabled={operation !== null}
                    maxLength={64}
                    onChange={(event) =>
                      updateChoice(scene.key, choice.key, {
                        targetSceneId: event.target.value,
                      })
                    }
                    required
                    value={choice.targetSceneId}
                  />
                </label>
                <button
                  disabled={operation !== null}
                  onClick={() => removeChoice(scene.key, choice.key)}
                  type="button"
                >
                  Xóa lựa chọn
                </button>
              </fieldset>
            ))}
            <button
              disabled={operation !== null || scene.choices.length >= 12}
              onClick={() => addChoice(scene.key)}
              type="button"
            >
              Thêm lựa chọn
            </button>
            <button
              disabled={operation !== null || scenes.length === 1}
              onClick={() => removeScene(scene.key)}
              type="button"
            >
              Xóa cảnh
            </button>
          </fieldset>
        ))}
        <button
          disabled={operation !== null || scenes.length >= 100}
          onClick={addScene}
          type="button"
        >
          Thêm cảnh
        </button>
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button
            disabled={operation !== null}
            onClick={saveStory}
            type="button"
          >
            {operation === "save" ? "Đang lưu…" : "Lưu cốt truyện"}
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
