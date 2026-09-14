"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GameProjectDocument,
  type GameProjectSummary,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function EngineForm({ gameId }: { gameId: string }) {
  const [project, setProject] = useState<GameProjectSummary | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const player = project?.document.scenes[0]?.objects[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let current: GameProjectSummary;
        try {
          current = await api.get<GameProjectSummary>(`/games/${gameId}/project`);
        } catch (caught) {
          if (!(caught instanceof ApiError) || caught.status !== 404) throw caught;
          try {
            current = await api.post<GameProjectSummary>(
              `/games/${gameId}/project`,
              { template: "phaser3-starter" },
            );
          } catch (created) {
            if (!(created instanceof ApiError) || created.status !== 409) {
              throw created;
            }
            current = await api.get<GameProjectSummary>(
              `/games/${gameId}/project`,
            );
          }
        }
        const result = await api.get<{ html: string }>(
          `/games/${gameId}/project/preview`,
        );
        if (cancelled) return;
        setProject(current);
        setPreview(result.html);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Unable to open the engine project.",
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const form = new FormData(event.currentTarget);
    const color = String(form.get("color") ?? "");
    const x = Number(form.get("x"));
    const y = Number(form.get("y"));
    const next = {
      ...project.document,
      scripts: { "main.ts": String(form.get("main.ts") ?? "") },
      scenes: project.document.scenes.map((scene, index) =>
        index === 0
          ? {
              ...scene,
              objects: scene.objects.map((item, objectIndex) =>
                objectIndex === 0 ? { ...item, color, x, y } : item,
              ),
            }
          : scene,
      ),
    };
    const parsed = GameProjectDocument.safeParse(next);
    if (!parsed.success) {
      setError("Check the player position, color, and TypeScript.");
      return;
    }
    setError("");
    setStatus("");
    setPending(true);
    try {
      const saved = await api.put<GameProjectSummary>(`/games/${gameId}/project`, {
        document: parsed.data,
      });
      const result = await api.get<{ html: string }>(
        `/games/${gameId}/project/preview`,
      );
      setProject(saved);
      setPreview(result.html);
      setStatus("Project saved.");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to save this project.",
      );
    } finally {
      setPending(false);
    }
  }

  async function build() {
    setError("");
    setStatus("");
    setPending(true);
    try {
      const version = await api.post<{ status: string }>(
        `/games/${gameId}/project/build`,
        {},
      );
      setStatus(
        version.status === "READY"
          ? "HTML5 build scanned and READY. Publish it from Manage release."
          : `Build finished: ${version.status}`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to build this project.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!project || !player) {
    return error ? <p role="alert">{error}</p> : <p>Loading engine…</p>;
  }

  return (
    <div>
      <iframe
        className="engine-preview"
        title="Live preview"
        sandbox="allow-scripts"
        srcDoc={preview}
      />
      <form className="form-stack" onSubmit={save}>
        <label>
          Player X
          <input name="x" type="number" defaultValue={player.x} required />
        </label>
        <label>
          Player Y
          <input name="y" type="number" defaultValue={player.y} required />
        </label>
        <label>
          Player color
          <input name="color" type="color" defaultValue={player.color} required />
        </label>
        <label>
          TypeScript (main.ts)
          <textarea
            name="main.ts"
            rows={12}
            defaultValue={project.document.scripts["main.ts"] ?? ""}
            spellCheck={false}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {status ? <p role="status">{status}</p> : null}
        <button type="submit" disabled={pending}>
          Save project
        </button>
      </form>
      <p>
        <button type="button" disabled={pending} onClick={() => void build()}>
          Build HTML5
        </button>
      </p>
    </div>
  );
}
