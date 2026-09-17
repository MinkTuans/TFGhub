"use client";

import { studioLabel } from "./studio-labels";
import { useState } from "react";
import {
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { useStudio } from "./studio-provider";
import { useStudioSelection } from "./studio-selection";
import { ComponentEditor, studioValidationMessage } from "./component-editor";
import {
  addComponentCommand,
  deleteObjectCommand,
  updateObjectCommand,
} from "./object-commands";
import { prepareStudioCommit } from "./studio-history";
import { StudioConfirmation } from "./studio-confirmation";
import type { StudioMutation } from "./studio-state";

type Scene = EngineProjectV2Type["scenes"][number];
type ObjectType = Scene["objects"][number];
export function PropertyInspector({ scene }: { scene: Scene }) {
  const { selection } = useStudioSelection();
  const object = scene.objects.find(
    (object) => object.id === selection.objectId,
  );
  return object ? (
    <ObjectInspector key={object.id} scene={scene} object={object} />
  ) : null;
}
function ObjectInspector({
  scene,
  object,
}: {
  scene: Scene;
  object: ObjectType;
}) {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const [adding, setAdding] =
    useState<ObjectType["components"][number]["type"]>("SpriteRenderer");
  const [deleting, setDeleting] = useState(false);
  const fields = {
    name: object.name,
    parentId: object.parentId,
    layerId: object.layerId,
    enabled: object.enabled,
    visible: object.visible,
    locked: object.locked,
    renderOrder: object.renderOrder,
  };
  const serialized = JSON.stringify(fields);
  const [baseline, setBaseline] = useState(serialized);
  const [draft, setDraft] = useState(fields);
  if (baseline !== serialized) {
    setBaseline(serialized);
    setDraft(fields);
    setError("");
  }
  const editable =
    state.ready &&
    !state.recoveryError &&
    !state.resolution &&
    !state.batchError;
  function commit(create: () => StudioMutation) {
    if (!editable) return false;
    try {
      const mutation = create();
      prepareStudioCommit(state, [mutation]);
      dispatch({ type: "commit", mutations: [mutation] });
      setError("");
      return true;
    } catch (error) {
      setError(studioValidationMessage(error));
      return false;
    }
  }
  const layer = scene.layers.find((layer) => layer.id === object.layerId)!;
  const types = (
    Object.keys(
      v2ComponentRegistry,
    ) as ObjectType["components"][number]["type"][]
  ).filter(
    (type) =>
      type !== "Transform" &&
      (!v2ComponentRegistry[type].allowedLayerTypes ||
        v2ComponentRegistry[type].allowedLayerTypes!.includes(layer.type)),
  );
  return (
    <section
      className="studio-property-inspector"
      aria-label="Thuộc tính đối tượng"
    >
      <h2>{object.name}</h2>
      <p className="studio-muted">{studioLabel(object.objectType)}</p>
      <fieldset disabled={!editable}>
        <legend>Đối tượng</legend>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            commit(() =>
              updateObjectCommand(scene.id, object.id, {
                ...draft,
                ...(draft.layerId === object.layerId
                  ? {}
                  : {
                      order:
                        Math.max(
                          -1,
                          ...scene.objects
                            .filter(
                              (candidate) =>
                                candidate.layerId === draft.layerId,
                            )
                            .map((candidate) => candidate.order),
                        ) + 1,
                    }),
              }),
            );
          }}
        >
          <label>
            Tên đối tượng
            <input
              name="name"
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            Đối tượng cha
            <select
              name="parentId"
              value={draft.parentId ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, parentId: event.target.value || null })
              }
            >
              <option value="">Không có</option>
              {scene.objects
                .filter((candidate) => candidate.id !== object.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lớp đối tượng
            <select
              name="layerId"
              value={draft.layerId}
              onChange={(event) =>
                setDraft({ ...draft, layerId: event.target.value })
              }
            >
              {[...scene.layers]
                .sort((a, b) => a.order - b.order)
                .map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Thứ tự vẽ
            <input
              name="renderOrder"
              type="number"
              value={
                Number.isFinite(draft.renderOrder) ? draft.renderOrder : ""
              }
              onChange={(event) =>
                setDraft({
                  ...draft,
                  renderOrder:
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="enabled"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Bật đối tượng
          </label>
          <label>
            <input
              type="checkbox"
              name="visible"
              checked={draft.visible}
              onChange={(event) =>
                setDraft({ ...draft, visible: event.target.checked })
              }
            />
            Hiện đối tượng
          </label>
          <label>
            <input
              type="checkbox"
              name="locked"
              checked={draft.locked}
              onChange={(event) =>
                setDraft({ ...draft, locked: event.target.checked })
              }
            />
            Khóa đối tượng
          </label>
          <button type="submit">Lưu đối tượng</button>
        </form>
        <button type="button" onClick={() => setDeleting(true)}>
          Xóa đối tượng
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Thuộc tính nâng cao</summary>
        <fieldset disabled={!editable}>
          <label>
            Thêm thành phần
            <select
              value={types.includes(adding) ? adding : types[0]}
              onChange={(event) =>
                setAdding(event.target.value as typeof adding)
              }
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {studioLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              commit(() =>
                addComponentCommand(
                  scene.id,
                  object.id,
                  types.includes(adding) ? adding : types[0],
                ),
              )
            }
          >
            Thêm thành phần
          </button>
        </fieldset>
        {object.components.map((component) => (
          <ComponentEditor
            key={component.id}
            sceneId={scene.id}
            objectId={object.id}
            component={component}
          />
        ))}
      </details>
      {deleting && (
        <StudioConfirmation
          title={`Xóa “${object.name}”?`}
          disabled={!editable}
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            if (commit(() => deleteObjectCommand(scene, object.id, true)))
              setDeleting(false);
          }}
        >
          <p>Xóa đối tượng và các đối tượng con. Bạn có thể hoàn tác.</p>
          {error && <p role="alert">{error}</p>}
        </StudioConfirmation>
      )}
    </section>
  );
}
