"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  buildRenderList,
  transformPoint,
  type Point,
} from "@indieforge/contracts";
import { useStudio } from "../studio-provider";
import { StudioConfirmation } from "../studio-confirmation";
import { deleteObjectCommand } from "../object-commands";
import { clientToWorld, screenToWorld, type Camera2D } from "./coordinates";
import { hitTest } from "./hit-test";
import { renderScene } from "./scene-renderer";
import {
  canResize,
  GestureController,
  type CanvasScene,
} from "./gesture-controller";
import { drawSelectionOverlay, resizeCorner } from "./selection-overlay";
import { useStudioSelection } from "../studio-selection";
import { createAssetDrop, STUDIO_ASSET_MIME } from "../asset-drop";
import { prepareStudioCommit } from "../studio-history";
import { studioValidationMessage } from "../component-editor";
import { useStudioShortcuts } from "../studio-shortcuts";

type Props = {
  scene: CanvasScene;
  pixelArt?: boolean;
  assetMetadata?: readonly unknown[];
  registerAssetPlacement?: (
    handler: ((payload: string) => void) | null,
  ) => void;
};

export function SceneCanvas(props: Props) {
  return <CanvasSession key={props.scene.id} {...props} />;
}

function CanvasSession({
  scene,
  pixelArt = false,
  assetMetadata = [],
  registerAssetPlacement,
}: Props) {
  const { state, dispatch } = useStudio();
  const { selection, selectObject } = useStudioSelection();
  const editable =
    state.ready &&
    !state.recoveryError &&
    !state.resolution &&
    !state.batchError;
  const requestedId =
    selection.sceneId === scene.id ? selection.objectId : null;
  const list = useMemo(() => buildRenderList(scene), [scene]);
  const selected = list.find((item) => item.objectId === requestedId);
  const selectedObject = scene.objects.find(
    (object) => object.id === requestedId,
  );
  const selectionId = selectedObject?.id ?? null;
  const resizable = !!(editable && selected && canResize(scene, selected));
  const [tool, setTool] = useState<"select" | "pan">("select");
  const { enabled: grid, snap } = scene.settings.grid;
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [dropError, setDropError] = useState("");
  const [controller] = useState(() => new GestureController());
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const zoomLabel = useRef<HTMLOutputElement>(null);
  const camera = useRef<Camera2D | null>(null);
  const frame = useRef<number | null>(null);
  const draw = useRef<() => void>(() => {});
  const space = useRef(false);
  const pan = useRef<{
    pointerId: number;
    point: Point;
  } | null>(null);
  const sceneRef = useRef(scene);
  const assetPlacement = useRef<(payload: string) => void>(() => {});
  const descriptionId = useId();

  function choose(id: string | null) {
    selectObject(scene.id, id);
  }
  useEffect(() => {
    if (selection.sceneId === scene.id && selection.focus === "canvas")
      canvas.current?.focus({ preventScroll: true });
  }, [selection.sequence, selection.sceneId, selection.focus, scene.id]);
  function toggleGrid(field: "enabled" | "snap") {
    if (!editable) return;
    cancel();
    dispatch({
      type: "commit",
      mutations: [
        {
          type: "scene.update",
          sceneId: scene.id,
          changes: {
            settings: {
              ...scene.settings,
              grid: {
                ...scene.settings.grid,
                [field]: !scene.settings.grid[field],
              },
            },
          },
        },
      ],
    });
  }
  function scheduleDraw() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      draw.current();
    });
  }
  function release(pointerId: number | null) {
    if (pointerId !== null && canvas.current?.hasPointerCapture?.(pointerId))
      canvas.current.releasePointerCapture(pointerId);
  }
  function cancel() {
    const pointerId = controller.pointerId ?? pan.current?.pointerId ?? null;
    controller.cancel();
    pan.current = null;
    release(pointerId);
    scheduleDraw();
  }
  function fit() {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const zoom = Math.min(rect.width / scene.width, rect.height / scene.height);
    camera.current = {
      x: -(rect.width / zoom - scene.width) / 2,
      y: -(rect.height / zoom - scene.height) / 2,
      zoom,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    };
  }
  function point(
    event: { clientX: number; clientY: number },
    requireScene = true,
  ): Point | null {
    const rect = canvas.current?.getBoundingClientRect(),
      view = camera.current;
    if (
      !rect ||
      !view ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY) ||
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return null;
    const world = clientToWorld(
      { x: event.clientX, y: event.clientY },
      rect,
      view,
    );
    return requireScene &&
      (world.x < 0 ||
        world.y < 0 ||
        world.x > scene.width ||
        world.y > scene.height)
      ? null
      : world;
  }
  function changeZoom(factor: number, anchor?: Point) {
    if (!camera.current || controller.pointerId !== null || pan.current) return;
    const view = camera.current;
    const target =
      anchor ??
      screenToWorld(
        { x: view.viewportWidth / 2, y: view.viewportHeight / 2 },
        view,
      );
    // Normal editing spans 10–800%; include Fit for extreme legal scene sizes.
    // Resizing the viewport must never make a zoom button reverse direction.
    const fitZoom = Math.min(
      view.viewportWidth / sceneRef.current.width,
      view.viewportHeight / sceneRef.current.height,
    );
    const zoom = Math.max(
      Math.min(0.1, fitZoom, view.zoom),
      Math.min(Math.max(8, fitZoom, view.zoom), view.zoom * factor),
    );
    camera.current = {
      ...view,
      zoom,
      x: target.x - ((target.x - view.x) * view.zoom) / zoom,
      y: target.y - ((target.y - view.y) * view.zoom) / zoom,
    };
    draw.current();
  }

  useEffect(() => {
    // Autosave acknowledgement replaces the immutable document with an equal
    // copy. Compare only when a new Scene arrives during a gesture, never on
    // pointer moves; real edits must still invalidate its captured geometry.
    if (
      (controller.pointerId !== null || pan.current) &&
      (!editable ||
        (sceneRef.current !== scene &&
          JSON.stringify(sceneRef.current) !== JSON.stringify(scene)))
    ) {
      cancel();
    }
    sceneRef.current = scene;
  });

  useEffect(() => {
    draw.current = () => {
      if (!camera.current) fit();
      const element = canvas.current,
        view = camera.current;
      if (!element || !view) return;
      element.dataset.cameraX = String(view.x === 0 ? 0 : view.x);
      element.dataset.cameraY = String(view.y === 0 ? 0 : view.y);
      element.dataset.cameraZoom = String(view.zoom);
      if (zoomLabel.current)
        zoomLabel.current.textContent = `${Math.round(view.zoom * 100)}%`;
      const currentList = controller.previewList(list);
      const item = currentList.find((item) => item.objectId === selectionId);
      if (handle.current && item) {
        const corner = resizeCorner(item, view);
        const worldCorner = transformPoint(item.matrix, {
          x: item.width,
          y: item.height,
        });
        handle.current.style.left = `${corner.x}px`;
        handle.current.style.top = `${corner.y}px`;
        handle.current.hidden =
          corner.x < 0 ||
          corner.y < 0 ||
          corner.x > view.viewportWidth ||
          corner.y > view.viewportHeight ||
          worldCorner.x < 0 ||
          worldCorner.y < 0 ||
          worldCorner.x > scene.width ||
          worldCorner.y > scene.height;
      }
      const context = element.getContext("2d");
      if (!context) return;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(view.viewportWidth * pixelRatio)),
        height = Math.max(1, Math.round(view.viewportHeight * pixelRatio));
      if (element.width !== width) element.width = width;
      if (element.height !== height) element.height = height;
      renderScene(context, currentList, view, {
        pixelRatio,
        surface: scene,
        pixelArt,
      });
      drawSelectionOverlay(
        context,
        scene,
        currentList,
        selectionId,
        view,
        pixelRatio,
        grid,
      );
    };
    if (!camera.current) fit();
    draw.current();
    // Redraw only for visual inputs, not provider persistence/status updates.
    // fit and the controller are canvas-owned; scene changes refresh this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, list, pixelArt, selectionId, grid, resizable]);

  useEffect(() => {
    const element = canvas.current!;
    const resize = () => {
      cancel();
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      if (camera.current)
        camera.current = {
          ...camera.current,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
        };
      draw.current();
    };
    const blur = () => {
      space.current = false;
      cancel();
    };
    const wheel = (event: WheelEvent) => {
      const anchor = point(event, false);
      if (!anchor || !Number.isFinite(event.deltaY)) return;
      event.preventDefault();
      changeZoom(
        Math.exp(-Math.max(-1000, Math.min(1000, event.deltaY)) * 0.002),
        anchor,
      );
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blur);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
      element.removeEventListener("wheel", wheel);
      const pointerId = controller.pointerId ?? pan.current?.pointerId ?? null;
      controller.cancel();
      pan.current = null;
      space.current = false;
      if (pointerId !== null && element.hasPointerCapture?.(pointerId))
        element.releasePointerCapture(pointerId);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // Each scene owns a fresh session. Native listeners use stable refs and the
    // scene dimensions of that session; render data is refreshed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  function begin(event: PointerEvent, resize = false) {
    if (
      event.button !== 0 ||
      !editable ||
      deleting ||
      controller.pointerId !== null ||
      pan.current
    )
      return;
    const panning = !resize && (space.current || tool === "pan");
    const world = point(event, !panning);
    if (!world || !camera.current) return;
    event.preventDefault();
    canvas.current?.focus();
    if (panning)
      pan.current = {
        pointerId: event.pointerId,
        point: world,
      };
    else {
      const id = resize ? selectionId : hitTest(list, world);
      if (!resize) choose(id);
      if (
        !id ||
        !controller.begin(scene, list, id, world, event.pointerId, resize)
      )
        return;
    }
    canvas.current?.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (
      controller.pointerId !== event.pointerId &&
      pan.current?.pointerId !== event.pointerId
    )
      return;
    const movingPan = pan.current;
    if (movingPan?.pointerId === event.pointerId) {
      const world = point(event, false),
        view = camera.current;
      if (!world || !view) return;
      // Account for the camera already updated by prior pointer events.
      camera.current = {
        ...view,
        x: view.x + movingPan.point.x - world.x,
        y: view.y + movingPan.point.y - world.y,
      };
      const element = canvas.current!;
      element.dataset.cameraX = String(camera.current.x);
      element.dataset.cameraY = String(camera.current.y);
    } else {
      const world = point(event);
      if (world)
        controller.move(world, event.pointerId, snap, scene.settings.grid.size);
    }
    scheduleDraw();
  }
  function end(event: PointerEvent) {
    if (
      controller.pointerId !== event.pointerId &&
      pan.current?.pointerId !== event.pointerId
    )
      return;
    if (!point(event, !pan.current)) {
      cancel();
      return;
    }
    move(event);
    const wasPanning = !!pan.current;
    const mutation = controller.finish(event.pointerId);
    pan.current = null;
    release(event.pointerId);
    if (mutation && editable)
      dispatch({ type: "commit", mutations: [mutation] });
    if (selectionId && !wasPanning)
      selectObject(scene.id, selectionId, "hierarchy");
    scheduleDraw();
  }
  function key(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.altKey) return;
    const modified = event.ctrlKey || event.metaKey;
    if (!modified && event.key === "Escape") {
      event.preventDefault();
      cancel();
      space.current = false;
      choose(null);
      return;
    }
    if (!modified && event.key === " ") {
      event.preventDefault();
      space.current = true;
      return;
    }
    if (!editable || deleting) return;
    if (modified && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      cancel();
      dispatch({
        type:
          event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo",
      });
    } else if (
      ["Delete", "Backspace"].includes(event.key) &&
      !modified &&
      selected &&
      !selected.locked &&
      controller.pointerId === null
    ) {
      event.preventDefault();
      setDeleteError("");
      setDeleting(selected.objectId);
    }
  }
  useStudioShortcuts({
    keyDown: key,
    keyUp: (event) => {
      if (event.key === " ") space.current = false;
    },
    blur: () => {
      space.current = false;
      cancel();
    },
  });
  function placeAsset(
    payload: string,
    client: Point,
    rect: { left: number; top: number; width: number; height: number },
  ) {
    if (!editable || !camera.current) return;
    cancel();
    try {
      // A selected group receives children. Other selections choose only a
      // layer; UI defaults to an editable UI layer when none is selected.
      const role = JSON.parse(payload)?.role;
      const target = selectedObject;
      const layerId =
        target?.layerId ??
        [...scene.layers]
          .sort((a, b) => b.order - a.order)
          .find(
            (layer) =>
              layer.visible &&
              !layer.locked &&
              (role !== "UI" || layer.type === "UI"),
          )?.id;
      if (!layerId) throw new Error("Không có lớp phù hợp để nhận tài nguyên.");
      const result = createAssetDrop({
        document: state.document,
        sceneId: scene.id,
        layerId,
        parentId: target?.objectType === "GROUP" ? target.id : null,
        payload,
        metadata: assetMetadata,
        client,
        rect,
        camera: camera.current,
      });
      prepareStudioCommit(state, result.mutations);
      dispatch({ type: "commit", mutations: result.mutations });
      selectObject(scene.id, result.objectId, "hierarchy");
      setDropError("");
    } catch (error) {
      setDropError(studioValidationMessage(error));
    }
  }
  assetPlacement.current = (payload) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    placeAsset(
      payload,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect,
    );
  };
  useLayoutEffect(() => {
    if (!registerAssetPlacement) return;
    const handler = (payload: string) => assetPlacement.current(payload);
    registerAssetPlacement(handler);
    return () => registerAssetPlacement(null);
  }, [registerAssetPlacement]);
  const deleteTarget =
    deleting && scene.objects.find((object) => object.id === deleting);
  return (
    <section className="studio-overview" aria-label="Tổng quan Cảnh">
      <div className="studio-overview__heading">
        <h2 className="studio-kicker">{scene.name}</h2>
        <output aria-live="polite">
          {selectedObject
            ? `Đã chọn: ${selectedObject.name}`
            : "Chọn đối tượng trên Cảnh"}
        </output>
      </div>
      <div
        className="studio-canvas-tools"
        role="toolbar"
        aria-label="Công cụ Khung vẽ"
      >
        <button
          type="button"
          aria-label="Chọn đối tượng"
          aria-pressed={tool === "select"}
          onClick={() => {
            cancel();
            setTool("select");
          }}
        >
          Chọn
        </button>
        <button
          type="button"
          aria-label="Di chuyển khung nhìn"
          aria-pressed={tool === "pan"}
          title="Di chuyển khung nhìn (giữ Space)"
          onClick={() => {
            cancel();
            setTool("pan");
          }}
        >
          Bàn tay
        </button>
        <button
          type="button"
          aria-label="Hiện lưới"
          aria-pressed={grid}
          disabled={!editable}
          onClick={() => toggleGrid("enabled")}
        >
          Lưới
        </button>
        <button
          type="button"
          aria-label="Bám lưới"
          aria-pressed={snap}
          disabled={!editable}
          onClick={() => toggleGrid("snap")}
        >
          Bám lưới
        </button>
        <button
          type="button"
          aria-label="Thu nhỏ"
          onClick={() => changeZoom(1 / 1.2)}
        >
          −
        </button>
        <output ref={zoomLabel} aria-label="Thu phóng">
          100%
        </output>
        <button
          type="button"
          aria-label="Phóng to"
          onClick={() => changeZoom(1.2)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Vừa Cảnh"
          onClick={() => {
            cancel();
            fit();
            draw.current();
          }}
        >
          Vừa Cảnh
        </button>
      </div>
      <div className="studio-canvas-stage" data-tool={tool}>
        <canvas
          ref={canvas}
          role="img"
          tabIndex={0}
          aria-label={`Cảnh: ${scene.name}`}
          aria-describedby={descriptionId}
          data-selected-object-id={selectionId ?? undefined}
          onDragOver={(event) => {
            if (
              editable &&
              event.dataTransfer.types.includes(STUDIO_ASSET_MIME)
            ) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes(STUDIO_ASSET_MIME)) return;
            event.preventDefault();
            placeAsset(
              event.dataTransfer.getData(STUDIO_ASSET_MIME),
              { x: event.clientX, y: event.clientY },
              event.currentTarget.getBoundingClientRect(),
            );
          }}
          onPointerDown={(event) => begin(event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={(event) => {
            if (
              controller.pointerId === event.pointerId ||
              pan.current?.pointerId === event.pointerId
            )
              cancel();
          }}
          onLostPointerCapture={(event) => {
            if (
              controller.pointerId === event.pointerId ||
              pan.current?.pointerId === event.pointerId
            )
              cancel();
          }}
        >
          Trình duyệt cần hỗ trợ Canvas2D để hiển thị Cảnh.
        </canvas>
        {resizable && selected && (
          <button
            ref={handle}
            type="button"
            className="studio-resize-handle"
            data-studio-undo-surface=""
            aria-label="Đổi kích thước"
            title={
              snap
                ? "Đổi kích thước (mũi tên: 1 ô lưới, Shift: 10 ô)"
                : "Đổi kích thước (phím mũi tên, Shift: 10 px)"
            }
            onPointerDown={(event) => begin(event, true)}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                ) ||
                controller.pointerId !== null
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const origin = transformPoint(selected.matrix, {
                x: selected.width,
                y: selected.height,
              });
              const step = event.shiftKey ? 10 : 1;
              const delta = {
                x:
                  event.key === "ArrowLeft"
                    ? -step
                    : event.key === "ArrowRight"
                      ? step
                      : 0,
                y:
                  event.key === "ArrowUp"
                    ? -step
                    : event.key === "ArrowDown"
                      ? step
                      : 0,
              };
              if (
                controller.begin(
                  scene,
                  list,
                  selected.objectId,
                  origin,
                  -1,
                  true,
                )
              ) {
                controller.resizeBy(delta, -1, snap, scene.settings.grid.size);
                const mutation = controller.finish(-1);
                if (mutation)
                  dispatch({ type: "commit", mutations: [mutation] });
              }
            }}
          />
        )}
      </div>
      <div className="studio-canvas-caption" id={descriptionId}>
        {dropError && <p role="alert">{dropError}</p>}
        <p>
          {scene.width} × {scene.height} px · {scene.layers.length} lớp ·{" "}
          {scene.objects.length} đối tượng
        </p>
        <p className="studio-muted">
          Kéo để di chuyển · Space: khung nhìn · Delete: xóa · Ctrl/Cmd+Z: hoàn
          tác
        </p>
        {scene.objects.length === 0 && (
          <p className="studio-muted">Cảnh này chưa có đối tượng.</p>
        )}
      </div>
      {deleteTarget && (
        <StudioConfirmation
          title={`Xóa “${deleteTarget.name}”?`}
          disabled={
            !editable ||
            !list.some((item) => item.objectId === deleting && !item.locked)
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            if (
              !editable ||
              !list.some((item) => item.objectId === deleting && !item.locked)
            )
              return;
            try {
              const mutation = deleteObjectCommand(
                scene,
                deleteTarget.id,
                true,
              );
              prepareStudioCommit(state, [mutation]);
              dispatch({
                type: "commit",
                mutations: [mutation],
              });
              setDeleting(null);
              choose(null);
            } catch (error) {
              setDeleteError(studioValidationMessage(error));
            }
          }}
        >
          <p>
            Đối tượng và các đối tượng con sẽ bị xóa. Bạn có thể hoàn tác thay
            đổi này.
          </p>
          {deleteError && <p role="alert">{deleteError}</p>}
        </StudioConfirmation>
      )}
    </section>
  );
}
