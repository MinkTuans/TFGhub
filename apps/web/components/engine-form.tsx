"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  GameProjectDocument,
  type EngineEvent,
  type EngineObject,
  type GameProjectSummary,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

const SCALE = 0.5;

function asDocument(value: GameProjectDocument): GameProjectDocument {
  return GameProjectDocument.parse(value);
}

export function EngineForm({ gameId }: { gameId: string }) {
  const [project, setProject] = useState<GameProjectSummary | null>(null);
  const [document, setDocument] = useState<GameProjectDocument | null>(null);
  const [selectedId, setSelectedId] = useState("player");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const scene = document?.scenes[0];
  const selected = scene?.objects.find((item) => item.id === selectedId);

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
        setDocument(asDocument(current.document));
        setSelectedId(current.document.scenes[0]?.objects[0]?.id ?? "player");
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

  function patchScene(objects: EngineObject[]) {
    if (!document || !scene) return;
    setDocument({
      ...document,
      scenes: [{ ...scene, objects }],
    });
  }

  function updateSelected(patch: { x?: number; y?: number; color?: string }) {
    if (!scene || !selected) return;
    patchScene(
      scene.objects.map((item) => {
        if (item.id !== selected.id) return item;
        if (item.type === "rectangle") return { ...item, ...patch };
        return { ...item, x: patch.x ?? item.x, y: patch.y ?? item.y };
      }),
    );
  }

  async function persist(next: GameProjectDocument, message: string) {
    const parsed = GameProjectDocument.safeParse(next);
    if (!parsed.success) {
      setError("Check the scene, assets, events, and TypeScript.");
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
      setDocument(asDocument(saved.document));
      setPreview(result.html);
      setStatus(message);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document) return;
    const form = new FormData(event.currentTarget);
    const next = {
      ...document,
      scripts: { "main.ts": String(form.get("main.ts") ?? "") },
      cameraFollow: String(form.get("cameraFollow") ?? "") || undefined,
      localSave: form.get("localSave") === "on",
    };
    await persist(next, "Project saved.");
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

  async function publish() {
    setError("");
    setStatus("");
    setPending(true);
    try {
      await api.post(`/games/${gameId}/project/publish`, {});
      setStatus("Built, scanned, and published.");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to publish this project.",
      );
    } finally {
      setPending(false);
    }
  }

  function addRectangle() {
    if (!scene) return;
    const id = `rect-${scene.objects.length + 1}`;
    patchScene([
      ...scene.objects,
      {
        id,
        type: "rectangle",
        x: 80,
        y: 80,
        width: 48,
        height: 48,
        color: "#c7d5e0",
        bounce: false,
        solid: false,
      },
    ]);
    setSelectedId(id);
  }

  function addEvent(event: EngineEvent) {
    if (!document) return;
    setDocument({ ...document, events: [...document.events, event] });
  }

  async function addAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !document) return;
    const allowed = [
      "image/png",
      "image/jpeg",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
    ] as const;
    const mime = allowed.find((item) => item === file.type);
    if (!mime) {
      setError("Use PNG, JPEG, MP3, OGG, or WAV.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    if (dataUrl.length > 400_000) {
      setError("Asset is too large (max ~300KB).");
      return;
    }
    const id = `asset-${document.assets.length + 1}`;
    const kind: "image" | "audio" = mime.startsWith("image/") ? "image" : "audio";
    const next = {
      ...document,
      assets: [
        ...document.assets,
        { id, kind, name: file.name, mime, dataBase64: dataUrl },
      ],
    };
    if (kind === "image" && scene) {
      const spriteId = `sprite-${scene.objects.length + 1}`;
      next.scenes = [
        {
          ...scene,
          objects: [
            ...scene.objects,
            {
              id: spriteId,
              type: "sprite",
              x: 120,
              y: 120,
              width: 48,
              height: 48,
              assetId: id,
              bounce: false,
              solid: false,
              frames: 1,
            },
          ],
        },
      ];
      setSelectedId(spriteId);
    }
    setDocument(next);
  }

  if (!project || !document || !scene || !selected) {
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
      <div className="engine-layout">
        <section aria-labelledby="scene-heading">
          <h2 id="scene-heading">Scene</h2>
          <div
            className="scene-editor"
            role="application"
            aria-label="Scene editor"
            style={{
              width: scene.width * SCALE,
              height: scene.height * SCALE,
              background: scene.background,
            }}
            onPointerMove={(event) => {
              if (!dragging) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - bounds.left) / SCALE - dragging.offsetX;
              const y = (event.clientY - bounds.top) / SCALE - dragging.offsetY;
              patchScene(
                scene.objects.map((item) =>
                  item.id === dragging.id ? { ...item, x, y } : item,
                ) as EngineObject[],
              );
            }}
            onPointerUp={() => setDragging(null)}
          >
            {scene.objects.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  item.id === selectedId ? "scene-object selected" : "scene-object"
                }
                style={{
                  left: item.x * SCALE,
                  top: item.y * SCALE,
                  width: item.width * SCALE,
                  height: item.height * SCALE,
                  background:
                    item.type === "rectangle" ? item.color : "#8b9e90",
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setSelectedId(item.id);
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDragging({
                    id: item.id,
                    offsetX: (event.clientX - bounds.left) / SCALE,
                    offsetY: (event.clientY - bounds.top) / SCALE,
                  });
                }}
              >
                {item.id}
              </button>
            ))}
          </div>
          <p>
            <button type="button" onClick={addRectangle}>
              Add rectangle
            </button>
          </p>
        </section>
        <form className="form-stack" onSubmit={save}>
          <h2>Inspector</h2>
          <p className="badge">{selected.id}</p>
          <label>
            X position
            <input
              name="x"
              type="number"
              value={Math.round(selected.x)}
              onChange={(event) =>
                updateSelected({ x: Number(event.target.value) })
              }
              required
            />
          </label>
          <label>
            Y position
            <input
              name="y"
              type="number"
              value={Math.round(selected.y)}
              onChange={(event) =>
                updateSelected({ y: Number(event.target.value) })
              }
              required
            />
          </label>
          {selected.type === "rectangle" ? (
            <label>
              Color
              <input
                name="color"
                type="color"
                value={selected.color}
                onChange={(event) => updateSelected({ color: event.target.value })}
                required
              />
            </label>
          ) : null}
          <label>
            Camera follow
            <select
              name="cameraFollow"
              defaultValue={document.cameraFollow ?? ""}
            >
              <option value="">None</option>
              {scene.objects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              name="localSave"
              type="checkbox"
              defaultChecked={document.localSave}
            />{" "}
            Local save
          </label>
          <label>
            Add image or audio
            <input
              type="file"
              accept="image/png,image/jpeg,audio/mpeg,audio/ogg,audio/wav"
              onChange={(event) => void addAsset(event)}
            />
          </label>
          <h3>No-code events</h3>
          <ul>
            {document.events.map((item) => (
              <li key={item.id}>
                {item.trigger} {item.key ?? `${item.a}/${item.b}`}{" "}
                <button
                  type="button"
                  onClick={() =>
                    setDocument({
                      ...document,
                      events: document.events.filter((row) => row.id !== item.id),
                    })
                  }
                >
                  Remove {item.id}
                </button>
              </li>
            ))}
          </ul>
          <p>
            <button
              type="button"
              onClick={() =>
                addEvent({
                  id: `jump-${document.events.length + 1}`,
                  trigger: "keydown",
                  key: "UP",
                  actions: [
                    {
                      type: "setVelocity",
                      objectId: selected.id,
                      vx: 0,
                      vy: -240,
                    },
                  ],
                })
              }
            >
              Add jump (UP)
            </button>
          </p>
          <label>
            TypeScript (main.ts)
            <textarea
              name="main.ts"
              rows={8}
              defaultValue={document.scripts["main.ts"] ?? ""}
              spellCheck={false}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          {status ? <p role="status">{status}</p> : null}
          <button type="submit" disabled={pending}>
            Save project
          </button>
        </form>
      </div>
      <p>
        <button type="button" disabled={pending} onClick={() => void build()}>
          Build HTML5
        </button>{" "}
        <button type="button" disabled={pending} onClick={() => void publish()}>
          Build and publish
        </button>
      </p>
    </div>
  );
}
