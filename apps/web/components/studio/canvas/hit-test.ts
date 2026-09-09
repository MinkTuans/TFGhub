import type {
  Bounds,
  Matrix2D,
  Point,
  RenderItem,
  RenderPrimitive,
} from "@indieforge/contracts";

function contains(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function localPoint(matrix: Matrix2D, point: Point): Point | null {
  const [a, b, c, d, e, f] = matrix;
  // Normalization avoids determinant overflow/underflow for legal deep scales.
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (!scale || !Number.isFinite(scale)) return null;
  const determinant = (a / scale) * (d / scale) - (b / scale) * (c / scale);
  if (!determinant) return null;
  const x = (point.x - e) / scale,
    y = (point.y - f) / scale;
  const local = {
    x: ((d / scale) * x - (c / scale) * y) / determinant,
    y: ((a / scale) * y - (b / scale) * x) / determinant,
  };
  return Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null;
}

function hitsPrimitive(primitive: RenderPrimitive, point: Point): boolean {
  if (primitive.opacity <= 0 || !contains(primitive, point)) return false;
  if (primitive.kind === "shape" && primitive.shape === "ellipse") {
    const x =
      (point.x - primitive.x - primitive.width / 2) / (primitive.width / 2);
    const y =
      (point.y - primitive.y - primitive.height / 2) / (primitive.height / 2);
    return x * x + y * y <= 1;
  }
  if (primitive.kind === "tiles") {
    const x = Math.floor((point.x - primitive.x) / primitive.tileWidth);
    const y = Math.floor((point.y - primitive.y) / primitive.tileHeight);
    return primitive.tiles.some((tile) => tile.x === x && tile.y === y);
  }
  return true;
}

/** Direct editor picking excludes locked objects; drawing and hierarchy
 * selection remain independent. Image picking is geometric, not alpha-based.
 * The caller converts CSS input and rejects points outside the viewport/scene.
 */
export function hitTest(
  list: readonly RenderItem[],
  worldPoint: Point,
): string | null {
  if (!Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y))
    return null;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (item.locked || !contains(item.bounds, worldPoint)) continue;
    const point = localPoint(item.matrix, worldPoint);
    if (
      point &&
      item.primitives.some((primitive) => hitsPrimitive(primitive, point))
    )
      return item.objectId;
  }
  return null;
}

/** World AABB of selected visible objects; locked IDs are allowed for hierarchy
 * selection. Returns fresh geometry without retaining canonical/render data.
 */
export function selectionBounds(
  list: readonly RenderItem[],
  ids: readonly string[],
): Bounds | null {
  const selected = new Set(ids);
  let result: Bounds | null = null;
  for (const item of list) {
    if (!selected.has(item.objectId)) continue;
    const bounds = item.bounds;
    if (!result) {
      result = { ...bounds };
      continue;
    }
    const x = Math.min(result.x, bounds.x),
      y = Math.min(result.y, bounds.y);
    result = {
      x,
      y,
      width: Math.max(result.x + result.width, bounds.x + bounds.width) - x,
      height: Math.max(result.y + result.height, bounds.y + bounds.height) - y,
    };
  }
  return result;
}
