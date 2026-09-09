"use client";

import { useState, type FormEvent } from "react";
import {
  ApplyMutationBatchInput,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { createStudioId, useStudio } from "./studio-provider";
import { StudioConfirmation } from "./studio-confirmation";
import { prepareStudioCommit, StudioMutationSizeError } from "./studio-history";

type Scene = EngineProjectV2Type["scenes"][number];

export function SceneManager({
  sceneId,
  onSceneChange,
}: {
  sceneId: string;
  onSceneChange: (id: string) => void;
}) {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const scenes = [...state.document.scenes].sort((a, b) => a.order - b.order);
  const scene = scenes.find((scene) => scene.id === sceneId)!;
  const position = scenes.findIndex((scene) => scene.id === sceneId);
  const selectedForDelete = scenes.find((scene) => scene.id === deleting);
  const commit = (mutation: unknown) => {
    if (!state.ready || state.resolution || state.batchError) return false;
    try {
      const mutations = ApplyMutationBatchInput.shape.mutations.parse([
        mutation,
      ]);
      prepareStudioCommit(state, mutations);
      dispatch({ type: "commit", mutations });
      setError("");
      return true;
    } catch (error) {
      setError(
        error instanceof StudioMutationSizeError
          ? error.message
          : "Không thể thay đổi Scene: kiểm tra thông tin, giới hạn và các tham chiếu từ đối tượng, sự kiện hoặc mã nguồn.",
      );
      return false;
    }
  };
  const move = (offset: number) => {
    const neighbor = scenes[position + offset];
    if (neighbor)
      commit({
        type: "scene.reorder",
        orders: scenes.map((value) => ({
          id: value.id,
          order:
            value.id === sceneId
              ? neighbor.order
              : value.id === neighbor.id
                ? scene.order
                : value.order,
        })),
      });
  };
  const create = () => {
    const id = createStudioId();
    const next: Scene = {
      id,
      key: `scene-${id}`,
      name: "Scene mới",
      type: "MIXED",
      order: Math.max(...scenes.map((scene) => scene.order)) + 1,
      width: state.document.settings.viewport.width,
      height: state.document.settings.viewport.height,
      background: { color: "#102030", assetId: null },
      settings: {
        gravityX: 0,
        gravityY: 0,
        grid: { enabled: false, size: 32, snap: false },
      },
      layers: [
        {
          id: createStudioId(),
          name: "Thế giới",
          type: "WORLD",
          order: 0,
          visible: true,
          locked: false,
        },
      ],
      objects: [],
    };
    if (
      commit({
        type: "scene.create",
        scene: next,
        variables: null,
        beforeSceneId: null,
        entry: false,
      })
    )
      onSceneChange(id);
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    commit({
      type: "scene.update",
      sceneId: scene.id,
      changes: {
        name: data.get("name"),
        key: data.get("key"),
        type: data.get("type"),
        width: Number(data.get("width")),
        height: Number(data.get("height")),
        background: { ...scene.background, color: data.get("color") },
        settings: {
          gravityX: Number(data.get("gravityX")),
          gravityY: Number(data.get("gravityY")),
          grid: {
            enabled: data.has("grid"),
            size: Number(data.get("size")),
            snap: data.has("snap"),
          },
        },
      },
    });
  };
  return (
    <section aria-label="Quản lý Scene">
      <nav id="studio-scene-list" aria-label="Danh sách Scene">
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            aria-pressed={scene.id === sceneId}
            onClick={() => onSceneChange(scene.id)}
          >
            <span className="studio-scene-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{scene.name}</span>
          </button>
        ))}
      </nav>
      <fieldset
        className="studio-editor"
        disabled={!state.ready || !!state.resolution || state.batchError}
      >
        <legend>Quản lý Scene</legend>
        <button type="button" disabled={scenes.length >= 100} onClick={create}>
          Thêm Scene
        </button>
        <form
          key={JSON.stringify([
            scene.id,
            scene.name,
            scene.key,
            scene.type,
            scene.width,
            scene.height,
            scene.background,
            scene.settings,
          ])}
          onSubmit={save}
        >
          <label>
            Tên Scene
            <input
              name="name"
              defaultValue={scene.name}
              required
              maxLength={80}
            />
          </label>
          <label>
            Khóa Scene
            <input
              name="key"
              defaultValue={scene.key}
              required
              pattern="[a-z][a-z0-9_-]{0,63}"
              maxLength={64}
            />
          </label>
          <label>
            Loại Scene
            <select name="type" defaultValue={scene.type}>
              {["MIXED", "MAP", "STORY", "MINI_GAME", "MENU"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Chiều rộng Scene
            <input
              name="width"
              type="number"
              min={1}
              max={65536}
              defaultValue={scene.width}
              required
            />
          </label>
          <label>
            Chiều cao Scene
            <input
              name="height"
              type="number"
              min={1}
              max={65536}
              defaultValue={scene.height}
              required
            />
          </label>
          <label>
            Màu nền Scene
            <input
              name="color"
              type="color"
              defaultValue={scene.background.color}
            />
          </label>
          <label>
            Trọng lực X
            <input
              name="gravityX"
              type="number"
              step="any"
              defaultValue={scene.settings.gravityX}
              required
            />
          </label>
          <label>
            Trọng lực Y
            <input
              name="gravityY"
              type="number"
              step="any"
              defaultValue={scene.settings.gravityY}
              required
            />
          </label>
          <label>
            <input
              name="grid"
              type="checkbox"
              defaultChecked={scene.settings.grid.enabled}
            />
            Bật lưới
          </label>
          <label>
            Kích thước lưới
            <input
              name="size"
              type="number"
              min={1}
              max={1024}
              defaultValue={scene.settings.grid.size}
              required
            />
          </label>
          <label>
            <input
              name="snap"
              type="checkbox"
              defaultChecked={scene.settings.grid.snap}
            />
            Bám lưới
          </label>
          <button type="submit">Lưu Scene</button>
        </form>
        {state.document.entrySceneId === sceneId ? (
          <p>Scene bắt đầu</p>
        ) : (
          <button
            type="button"
            onClick={() => commit({ type: "scene.entry", sceneId })}
          >
            Đặt làm Scene bắt đầu
          </button>
        )}
        <div className="studio-actions">
          <button
            type="button"
            disabled={position === 0}
            onClick={() => move(-1)}
          >
            Đưa Scene lên
          </button>
          <button
            type="button"
            disabled={position === scenes.length - 1}
            onClick={() => move(1)}
          >
            Đưa Scene xuống
          </button>
          <button
            type="button"
            disabled={scenes.length >= 100}
            onClick={() => {
              const newId = createStudioId();
              if (
                commit({
                  type: "scene.duplicate",
                  sceneId,
                  newId,
                  name: `${scene.name.slice(0, 70)} (bản sao)`,
                  key: `scene-${newId}`,
                })
              )
                onSceneChange(newId);
            }}
          >
            Nhân bản Scene
          </button>
          <button
            type="button"
            disabled={scenes.length === 1}
            onClick={() => {
              setDeleting(sceneId);
              setReplacement("");
              setError("");
            }}
          >
            Xóa Scene
          </button>
        </div>
      </fieldset>
      {error && !selectedForDelete && <p role="alert">{error}</p>}
      {selectedForDelete && (
        <StudioConfirmation
          title="Xóa Scene"
          onCancel={() => {
            setDeleting(null);
            setError("");
          }}
          disabled={
            !state.ready ||
            !!state.resolution ||
            state.batchError ||
            (state.document.entrySceneId === deleting && !replacement)
          }
          onConfirm={() => {
            if (
              commit({
                type: "scene.delete",
                sceneId: deleting,
                confirmed: true,
                replacementSceneId:
                  state.document.entrySceneId === deleting ? replacement : null,
              })
            )
              setDeleting(null);
          }}
        >
          <p>
            Xóa “{selectedForDelete.name}”, các lớp, đối tượng và biến của
            Scene. Các tham chiếu từ nơi khác phải được gỡ trước khi xóa.
          </p>
          {state.document.entrySceneId === deleting && (
            <label>
              Scene bắt đầu thay thế
              <select
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
              >
                <option value="">Chọn Scene</option>
                {scenes
                  .filter((scene) => scene.id !== deleting)
                  .map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {error && <p role="alert">{error}</p>}
        </StudioConfirmation>
      )}
    </section>
  );
}
