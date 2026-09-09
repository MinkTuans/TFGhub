import type { Point } from "@indieforge/contracts";

/** x/y are the world coordinates at the viewport's top-left; sizes are CSS px.
 * Device pixel ratio belongs only to the raster backing buffer, never input.
 */
export type Camera2D = {
  x: number;
  y: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
};

export function validateCamera(camera: Camera2D): void {
  if (
    ![
      camera.x,
      camera.y,
      camera.zoom,
      camera.viewportWidth,
      camera.viewportHeight,
    ].every(Number.isFinite) ||
    camera.zoom <= 0 ||
    camera.viewportWidth <= 0 ||
    camera.viewportHeight <= 0 ||
    !Number.isFinite(camera.x + camera.viewportWidth / camera.zoom) ||
    !Number.isFinite(camera.y + camera.viewportHeight / camera.zoom)
  ) {
    throw new RangeError(
      "Camera coordinates must be finite and zoom/viewport sizes positive",
    );
  }
}

function finitePoint(point: Point): Point {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Point must be finite");
  return point;
}

export function worldToScreen(point: Point, camera: Camera2D): Point {
  validateCamera(camera);
  finitePoint(point);
  return finitePoint({
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  });
}

export function screenToWorld(point: Point, camera: Camera2D): Point {
  validateCamera(camera);
  finitePoint(point);
  return finitePoint({
    x: point.x / camera.zoom + camera.x,
    y: point.y / camera.zoom + camera.y,
  });
}

export function clientToWorld(
  point: Point,
  rect: { left: number; top: number; width: number; height: number },
  camera: Camera2D,
): Point {
  if (
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new RangeError(
      "Canvas CSS rectangle must be finite with positive dimensions",
    );
  return screenToWorld(
    {
      x: ((point.x - rect.left) * camera.viewportWidth) / rect.width,
      y: ((point.y - rect.top) * camera.viewportHeight) / rect.height,
    },
    camera,
  );
}
