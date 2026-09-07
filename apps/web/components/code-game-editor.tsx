"use client";

import { useState } from "react";
import { CodeProjectInput, type GameSummary } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

const SOURCE_LIMIT = 50_000;

type Source = {
  sourceType: "CODE";
  html: string;
  css: string;
  javascript: string;
};

function savedSource(projectData: GameSummary["projectData"]): Source {
  const parsed = CodeProjectInput.safeParse(projectData);
  return parsed.success
    ? parsed.data
    : { sourceType: "CODE", html: "", css: "", javascript: "" };
}

function errorMessage(error: unknown): string {
  return apiErrorMessage(
    error,
    "Không thể lưu hoặc tạo bản chơi thử. Vui lòng thử lại.",
  );
}

export function CodeGameEditor({
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
  const initialSource = savedSource(initialProject);
  const [source, setSource] = useState(initialSource);
  const [saved, setSaved] = useState(initialSource);
  const [hasSavedProject, setHasSavedProject] = useState(
    CodeProjectInput.safeParse(initialProject).success,
  );
  const [operation, setOperation] = useState<"save" | "build" | null>(null);
  const [error, setError] = useState("");
  const isDirty =
    source.html !== saved.html ||
    source.css !== saved.css ||
    source.javascript !== saved.javascript;

  async function saveSource() {
    setError("");
    setOperation("save");
    try {
      const game = await api.put<GameSummary>(
        `/games/${gameId}/project`,
        source,
      );
      setSaved(source);
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
      aria-labelledby="code-editor-heading"
    >
      <h2 id="code-editor-heading">Trình soạn mã</h2>
      <div className="form-stack">
        <label>
          HTML
          <textarea
            aria-describedby="html-count"
            disabled={operation !== null}
            maxLength={SOURCE_LIMIT}
            onChange={(event) =>
              setSource((current) => ({ ...current, html: event.target.value }))
            }
            rows={12}
            value={source.html}
          />
        </label>
        <p className="hint" id="html-count">
          {source.html.length}/{SOURCE_LIMIT} ký tự
        </p>
        <label>
          CSS
          <textarea
            aria-describedby="css-count"
            disabled={operation !== null}
            maxLength={SOURCE_LIMIT}
            onChange={(event) =>
              setSource((current) => ({ ...current, css: event.target.value }))
            }
            rows={12}
            value={source.css}
          />
        </label>
        <p className="hint" id="css-count">
          {source.css.length}/{SOURCE_LIMIT} ký tự
        </p>
        <label>
          JavaScript
          <textarea
            aria-describedby="javascript-count"
            disabled={operation !== null}
            maxLength={SOURCE_LIMIT}
            onChange={(event) =>
              setSource((current) => ({
                ...current,
                javascript: event.target.value,
              }))
            }
            rows={12}
            value={source.javascript}
          />
        </label>
        <p className="hint" id="javascript-count">
          {source.javascript.length}/{SOURCE_LIMIT} ký tự
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions">
          <button
            disabled={operation !== null}
            onClick={saveSource}
            type="button"
          >
            {operation === "save" ? "Đang lưu…" : "Lưu mã nguồn"}
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
