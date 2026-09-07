"use client";

import { useRef, useState } from "react";
import {
  StoryProjectInput,
  type GameSummary,
  type StoryProjectInput as StoryProject,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

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
      speaker: "Narrator",
      dialogue: "Begin your story.",
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
  return error instanceof ApiError
    ? error.message
    : "Unable to connect. Please try again.";
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
      current.map((scene) => (scene.key === key ? { ...scene, ...update } : scene)),
    );
  }

  function addScene() {
    setScenes((current) => {
      let number = current.length + 1;
      while (current.some((scene) => scene.id === `scene-${number}`)) number += 1;
      return [
        ...current,
        {
          key: addedKey("scene"),
          id: `scene-${number}`,
          speaker: "Narrator",
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
                  text: "Continue",
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
              choices: scene.choices.filter((choice) => choice.key !== choiceKey),
            }
          : scene,
      ),
    );
  }

  async function saveStory() {
    setError("");
    const parsed = StoryProjectInput.safeParse(project);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your story.");
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
    <section aria-labelledby="story-editor-heading">
      <h2 id="story-editor-heading">Story editor</h2>
      <div className="form-stack">
        <label>
          Start scene ID
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
            <legend>Scene {sceneIndex + 1}</legend>
            <label>
              Scene ID
              <input
                disabled={operation !== null}
                maxLength={64}
                onChange={(event) => updateScene(scene.key, { id: event.target.value })}
                required
                value={scene.id}
              />
            </label>
            <label>
              Speaker
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
              Dialogue
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
              Background color
              <input
                disabled={operation !== null}
                onChange={(event) =>
                  updateScene(scene.key, { backgroundColor: event.target.value })
                }
                pattern="#[0-9a-fA-F]{6}"
                type="text"
                value={scene.backgroundColor}
              />
            </label>
            {scene.choices.map((choice, choiceIndex) => (
              <fieldset key={choice.key}>
                <legend>Choice {choiceIndex + 1}</legend>
                <label>
                  Choice text
                  <input
                    disabled={operation !== null}
                    maxLength={200}
                    onChange={(event) =>
                      updateChoice(scene.key, choice.key, { text: event.target.value })
                    }
                    required
                    value={choice.text}
                  />
                </label>
                <label>
                  Target scene ID
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
                  Remove choice
                </button>
              </fieldset>
            ))}
            <button
              disabled={operation !== null || scene.choices.length >= 12}
              onClick={() => addChoice(scene.key)}
              type="button"
            >
              Add choice
            </button>
            <button
              disabled={operation !== null || scenes.length === 1}
              onClick={() => removeScene(scene.key)}
              type="button"
            >
              Remove scene
            </button>
          </fieldset>
        ))}
        <button
          disabled={operation !== null || scenes.length >= 100}
          onClick={addScene}
          type="button"
        >
          Add scene
        </button>
        {error && <p role="alert">{error}</p>}
        <button disabled={operation !== null} onClick={saveStory} type="button">
          {operation === "save" ? "Saving…" : "Save story"}
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
