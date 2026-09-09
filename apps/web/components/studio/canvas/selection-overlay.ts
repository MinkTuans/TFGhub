import {
  transformPoint,
  type Point,
  type RenderItem,
} from "@indieforge/contracts";
import { worldToScreen, type Camera2D } from "./coordinates";
import type { CanvasScene } from "./gesture-controller";

export function resizeCorner(item: RenderItem, camera: Camera2D): Point {
  return worldToScreen(
    transformPoint(item.matrix, { x: item.width, y: item.height }),
    camera,
  );
}

/** Editor adornments are independent from the shared runtime renderer. */
export function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  scene: CanvasScene,
  list: readonly RenderItem[],
  selectedId: string | null,
  camera: Camera2D,
  pixelRatio: number,
  grid: boolean,
): void {
  context.save();
  try {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.beginPath();
    context.rect(0, 0, camera.viewportWidth, camera.viewportHeight);
    context.clip();
    const origin = worldToScreen({ x: 0, y: 0 }, camera);
    context.beginPath();
    context.rect(
      origin.x,
      origin.y,
      scene.width * camera.zoom,
      scene.height * camera.zoom,
    );
    context.clip();
    if (grid) {
      // Cull to the viewport and coarsen only the visual grid at distant zoom.
      const size =
        scene.settings.grid.size *
        Math.max(1, Math.ceil(8 / (scene.settings.grid.size * camera.zoom)));
      context.strokeStyle = "#60748b66";
      context.lineWidth = 1;
      context.beginPath();
      for (
        let x = Math.max(0, Math.ceil(camera.x / size) * size);
        x <=
        Math.min(scene.width, camera.x + camera.viewportWidth / camera.zoom);
        x += size
      ) {
        const sx = (x - camera.x) * camera.zoom;
        context.moveTo(sx, origin.y);
        context.lineTo(sx, origin.y + scene.height * camera.zoom);
      }
      for (
        let y = Math.max(0, Math.ceil(camera.y / size) * size);
        y <=
        Math.min(scene.height, camera.y + camera.viewportHeight / camera.zoom);
        y += size
      ) {
        const sy = (y - camera.y) * camera.zoom;
        context.moveTo(origin.x, sy);
        context.lineTo(origin.x + scene.width * camera.zoom, sy);
      }
      context.stroke();
    }
    const item = list.find((item) => item.objectId === selectedId);
    if (!item) return;
    const point = worldToScreen(item.bounds, camera);
    context.strokeStyle = item.locked ? "#e0a448" : "#65c9ff";
    context.lineWidth = 2;
    context.setLineDash(item.locked ? [5, 4] : []);
    context.strokeRect(
      point.x,
      point.y,
      item.bounds.width * camera.zoom,
      item.bounds.height * camera.zoom,
    );
  } finally {
    context.restore();
  }
}
