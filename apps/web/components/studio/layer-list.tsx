"use client";

import { useState } from "react";
import { ApplyMutationBatchInput } from "@indieforge/contracts";
import { createStudioId, useStudio } from "./studio-provider";
import { StudioConfirmation } from "./studio-confirmation";
import { prepareStudioCommit, StudioMutationSizeError } from "./studio-history";

export function LayerList({ sceneId }: { sceneId: string }) {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const scene = state.document.scenes.find((scene) => scene.id === sceneId)!;
  const layers = [...scene.layers].sort((a, b) => a.order - b.order);
  const selectedForDelete = layers.find((layer) => layer.id === deleting);
  const commit = (mutation: unknown) => {
    if (!state.ready || state.batchError) return false;
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
          : "Không thể thay đổi lớp: kiểm tra loại lớp, giới hạn và các tham chiếu từ đối tượng, sự kiện hoặc mã nguồn.",
      );
      return false;
    }
  };
  return (
    <section className="studio-editor" aria-label="Các lớp">
      <h2>Các lớp</h2>
      <fieldset disabled={!state.ready || state.batchError}>
        <legend>Quản lý lớp</legend>
        <button
          type="button"
          disabled={layers.length >= 100}
          onClick={() =>
            commit({
              type: "layer.create",
              sceneId,
              beforeLayerId: null,
              objects: [],
              layer: {
                id: createStudioId(),
                name: "Lớp mới",
                type: "WORLD",
                order: Math.max(...layers.map((layer) => layer.order)) + 1,
                visible: true,
                locked: false,
              },
            })
          }
        >
          Thêm lớp
        </button>
        {layers.map((layer, index) => {
          const move = (offset: number) => {
            const neighbor = layers[index + offset];
            if (neighbor)
              commit({
                type: "layer.reorder",
                sceneId,
                orders: layers.map((value) => ({
                  id: value.id,
                  order:
                    value.id === layer.id
                      ? neighbor.order
                      : value.id === neighbor.id
                        ? layer.order
                        : value.order,
                })),
              });
          };
          return (
            <fieldset key={layer.id} aria-label={layer.name}>
              <legend>{layer.name}</legend>
              <form
                key={JSON.stringify(layer)}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  commit({
                    type: "layer.update",
                    sceneId,
                    layerId: layer.id,
                    changes: {
                      name: data.get("name"),
                      type: data.get("type"),
                      visible: data.has("visible"),
                      locked: data.has("locked"),
                    },
                  });
                }}
              >
                <label>
                  Tên lớp
                  <input
                    name="name"
                    defaultValue={layer.name}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  Loại lớp
                  <select name="type" defaultValue={layer.type}>
                    {["WORLD", "UI", "COLLISION"].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    name="visible"
                    type="checkbox"
                    defaultChecked={layer.visible}
                  />
                  Hiện lớp
                </label>
                <label>
                  <input
                    name="locked"
                    type="checkbox"
                    defaultChecked={layer.locked}
                  />
                  Khóa lớp
                </label>
                <button type="submit">Lưu lớp</button>
              </form>
              <div className="studio-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  Đưa lớp lên
                </button>
                <button
                  type="button"
                  disabled={index === layers.length - 1}
                  onClick={() => move(1)}
                >
                  Đưa lớp xuống
                </button>
                <button
                  type="button"
                  disabled={layers.length >= 100}
                  onClick={() =>
                    commit({
                      type: "layer.duplicate",
                      sceneId,
                      layerId: layer.id,
                      newId: createStudioId(),
                      name: `${layer.name.slice(0, 70)} (bản sao)`,
                    })
                  }
                >
                  Nhân bản lớp
                </button>
                <button
                  type="button"
                  disabled={layers.length === 1}
                  onClick={() => {
                    setDeleting(layer.id);
                    setError("");
                  }}
                >
                  Xóa lớp
                </button>
              </div>
            </fieldset>
          );
        })}
      </fieldset>
      {error && !selectedForDelete && <p role="alert">{error}</p>}
      {selectedForDelete && (
        <StudioConfirmation
          title="Xóa lớp"
          onCancel={() => {
            setDeleting(null);
            setError("");
          }}
          disabled={!state.ready || state.batchError}
          onConfirm={() => {
            if (
              commit({
                type: "layer.delete",
                sceneId,
                layerId: deleting,
                confirmed: true,
              })
            )
              setDeleting(null);
          }}
        >
          <p>
            Xóa “{selectedForDelete.name}” và tất cả đối tượng thuộc lớp này.
            Các tham chiếu từ nơi khác phải được gỡ trước khi xóa.
          </p>
          {error && <p role="alert">{error}</p>}
        </StudioConfirmation>
      )}
    </section>
  );
}
