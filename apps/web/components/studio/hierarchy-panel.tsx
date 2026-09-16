"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { studioValidationMessage } from "./component-editor";
import type { EngineProjectV2Type } from "@indieforge/contracts";
import { useStudio } from "./studio-provider";
import { useStudioSelection } from "./studio-selection";
import { prepareStudioCommit } from "./studio-history";
import type { StudioMutation } from "./studio-state";

type Scene = EngineProjectV2Type["scenes"][number];
type Row = {
  id: string;
  name: string;
  level: number;
  parent: string | null;
  children: string[];
  layer: boolean;
  visible: boolean;
  locked: boolean;
};
export function HierarchyPanel({ scene }: { scene: Scene }) {
  return <HierarchySession key={scene.id} scene={scene} />;
}
function HierarchySession({ scene }: { scene: Scene }) {
  const { state, dispatch } = useStudio();
  const { selection, selectObject } = useStudioSelection();
  const [expanded, setExpanded] = useState(
    () => new Set(scene.layers.map((layer) => layer.id)),
  );
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState("");
  const elements = useRef(new Map<string, HTMLDivElement>());
  const layers = [...scene.layers].sort((a, b) => a.order - b.order);
  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  const byParent = new Map<string, Scene["objects"]>();
  for (const object of [...scene.objects].sort(
    (a, b) =>
      layerMap.get(a.layerId)!.order - layerMap.get(b.layerId)!.order ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  )) {
    const key = object.parentId ?? object.layerId;
    byParent.set(key, [...(byParent.get(key) ?? []), object]);
  }
  // Canvas selection opens every real ancestor, including a parent on another
  // layer. Expansion remains editor state; there is one row per stable object.
  const ancestors: string[] = [];
  let selected =
    selection.sceneId === scene.id && selection.objectId
      ? objects.get(selection.objectId)
      : undefined;
  while (selected) {
    const parent = selected.parentId ?? selected.layerId;
    ancestors.push(parent);
    selected = selected.parentId ? objects.get(selected.parentId) : undefined;
  }
  const reveal = `${selection.sequence}:${selection.objectId}:${ancestors.join(",")}`;
  const [lastReveal, setLastReveal] = useState("");
  if (reveal !== lastReveal) {
    setLastReveal(reveal);
    if (ancestors.some((id) => !expanded.has(id)))
      setExpanded(new Set([...expanded, ...ancestors]));
  }
  const rows: Row[] = [];
  const stack = layers
    .map((layer) => ({
      id: layer.id,
      name: layer.name,
      level: 1,
      parent: null,
      layer: true,
      visible: layer.visible,
      locked: layer.locked,
      children: (byParent.get(layer.id) ?? []).map((o) => o.id),
    }))
    .reverse() as Row[];
  while (stack.length) {
    const row = stack.pop()!;
    rows.push(row);
    if (!expanded.has(row.id)) continue;
    for (const object of [...(byParent.get(row.id) ?? [])].reverse()) {
      const layer = layerMap.get(object.layerId)!;
      stack.push({
        id: object.id,
        name: object.name,
        level: row.level + 1,
        parent: row.id,
        layer: false,
        visible:
          row.visible && layer.visible && object.visible && object.enabled,
        locked: row.locked || layer.locked || object.locked,
        children: (byParent.get(object.id) ?? []).map((o) => o.id),
      });
    }
  }
  const editable =
    state.ready &&
    !state.recoveryError &&
    !state.resolution &&
    !state.batchError;
  const focusId = rows.some((row) => row.id === focused)
    ? focused
    : rows.some((row) => row.id === selection.objectId)
      ? selection.objectId
      : rows[0]?.id;
  useEffect(() => {
    if (
      selection.focus !== "hierarchy" ||
      selection.sceneId !== scene.id ||
      !selection.objectId
    )
      return;
    const element = elements.current.get(selection.objectId);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: "nearest" });
  }, [
    selection.sequence,
    selection.focus,
    selection.sceneId,
    selection.objectId,
    scene.id,
  ]);
  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function focus(id: string) {
    setFocused(id);
    elements.current.get(id)?.focus();
  }
  function key(event: KeyboardEvent, row: Row) {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing)
      return;
    if (event.altKey) return;
    // Editor-wide shortcuts bubble to the owning Studio boundary.
    if (event.ctrlKey || event.metaKey) return;
    const index = rows.indexOf(row);
    if (
      [
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
        "ArrowRight",
        "ArrowLeft",
        "Enter",
        " ",
      ].includes(event.key)
    )
      event.preventDefault();
    if (event.key === "ArrowDown")
      focus(rows[Math.min(rows.length - 1, index + 1)].id);
    else if (event.key === "ArrowUp") focus(rows[Math.max(0, index - 1)].id);
    else if (event.key === "Home") focus(rows[0].id);
    else if (event.key === "End") focus(rows.at(-1)!.id);
    else if (event.key === "ArrowRight" && row.children.length) {
      if (!expanded.has(row.id)) toggle(row.id);
      else focus(row.children[0]);
    } else if (event.key === "ArrowLeft") {
      if (expanded.has(row.id) && row.children.length) toggle(row.id);
      else if (row.parent) focus(row.parent);
    } else if (event.key === "Enter" || event.key === " ") {
      if (row.layer) toggle(row.id);
      else
        selectObject(scene.id, row.id, event.key === "Enter" ? "canvas" : null);
    }
  }
  function commit(mutation: StudioMutation) {
    if (!editable) return;
    try {
      prepareStudioCommit(state, [mutation]);
      dispatch({ type: "commit", mutations: [mutation] });
      setError("");
    } catch (error) {
      setError(
        studioValidationMessage(error),
      );
    }
  }
  return (
    <section className="studio-hierarchy" aria-label="Phân cấp Cảnh">
      <h2>Đối tượng</h2>
      <div role="tree" aria-label="Đối tượng Cảnh">
        {rows.map((row) => (
          <div
            key={row.id}
            ref={(element) => {
              if (element) elements.current.set(row.id, element);
              else elements.current.delete(row.id);
            }}
            role="treeitem"
            aria-label={row.name}
            aria-description={`${row.visible ? "Đang hiện" : "Đang ẩn"} · ${row.locked ? "Đã khóa" : "Không khóa"}`}
            aria-level={row.level}
            aria-selected={!row.layer && selection.objectId === row.id}
            aria-expanded={
              row.children.length || row.layer
                ? expanded.has(row.id)
                : undefined
            }
            tabIndex={row.id === focusId ? 0 : -1}
            data-effective-visible={row.visible}
            data-effective-locked={row.locked}
            style={{ paddingLeft: `${(row.level - 1) * 12}px` }}
            onFocus={(event) => {
              if (event.target === event.currentTarget) setFocused(row.id);
            }}
            onKeyDown={(event) => key(event, row)}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              focus(row.id);
              if (row.layer) toggle(row.id);
              else selectObject(scene.id, row.id);
            }}
          >
            {(row.children.length > 0 || row.layer) && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${expanded.has(row.id) ? "Thu gọn" : "Mở rộng"} ${row.name}`}
                onClick={() => toggle(row.id)}
              >
                {expanded.has(row.id) ? "▾" : "▸"}
              </button>
            )}
            <span className="studio-tree-name">{row.name}</span>
            {!row.layer &&
              objects.get(row.id)?.parentId &&
              objects.get(row.id)?.layerId !==
                objects.get(objects.get(row.id)!.parentId!)?.layerId && (
                <small>
                  {layerMap.get(objects.get(row.id)!.layerId)?.name}
                </small>
              )}
            <span aria-hidden="true">
              {!row.visible ? " ◌" : ""}
              {row.locked ? " 🔒" : ""}
            </span>
          </div>
        ))}
      </div>
      <details open>
        <summary>Thứ tự và trạng thái lớp</summary>
        {layers.map((layer, index) => (
          <div className="studio-layer-actions" key={layer.id}>
            <span>{layer.name}</span>
            <button
              type="button"
              disabled={!editable}
              aria-label={`${layer.visible ? "Ẩn" : "Hiện"} ${layer.name}`}
              onClick={() =>
                commit({
                  type: "layer.update",
                  sceneId: scene.id,
                  layerId: layer.id,
                  changes: { visible: !layer.visible },
                })
              }
            >
              {layer.visible ? "Ẩn" : "Hiện"}
            </button>
            <button
              type="button"
              disabled={!editable}
              aria-label={`${layer.locked ? "Mở khóa" : "Khóa"} ${layer.name}`}
              onClick={() =>
                commit({
                  type: "layer.update",
                  sceneId: scene.id,
                  layerId: layer.id,
                  changes: { locked: !layer.locked },
                })
              }
            >
              {layer.locked ? "Mở khóa" : "Khóa"}
            </button>
            {[-1, 1].map((offset) => (
              <button
                key={offset}
                type="button"
                disabled={!editable || !layers[index + offset]}
                aria-label={`Đưa ${layer.name} ${offset < 0 ? "lên" : "xuống"}`}
                onClick={() => {
                  const neighbor = layers[index + offset];
                  if (neighbor)
                    commit({
                      type: "layer.reorder",
                      sceneId: scene.id,
                      orders: layers.map((item) => ({
                        id: item.id,
                        order:
                          item.id === layer.id
                            ? neighbor.order
                            : item.id === neighbor.id
                              ? layer.order
                              : item.order,
                      })),
                    });
                }}
              >
                {offset < 0 ? "↑" : "↓"}
              </button>
            ))}
          </div>
        ))}
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
