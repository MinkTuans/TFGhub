import {
  buildRenderList,
  transformPoint,
  v2ComponentRegistry,
  type EngineProjectV2Type,
  type Matrix2D,
  type Point,
  type RenderItem,
} from "@indieforge/contracts";
import type { StudioMutation } from "../studio-state";

export type CanvasScene = EngineProjectV2Type["scenes"][number];
type Transform = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  pivot: Point;
};
const identity: Matrix2D = [1, 0, 0, 1, 0, 0];

/** Invert just the linear part for world deltas; translation must not enter it. */
function inverseDelta(matrix: Matrix2D, delta: Point): Point | null {
  const [a, b, c, d] = matrix;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (!scale || !Number.isFinite(scale)) return null;
  const determinant = (a / scale) * (d / scale) - (b / scale) * (c / scale);
  if (!determinant) return null;
  const x = delta.x / scale,
    y = delta.y / scale;
  const result = {
    x: ((d / scale) * x - (c / scale) * y) / determinant,
    y: ((a / scale) * y - (b / scale) * x) / determinant,
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

/** These components derive their rendered extent from Transform. Components
 * with independent geometry (colliders, tiles, legacy shapes, custom effects)
 * deliberately have no size handle. Resizing parents is left to the inspector.
 */
export function canResize(scene: CanvasScene, item: RenderItem): boolean {
  const object = scene.objects.find((object) => object.id === item.objectId);
  return (
    !!object &&
    !item.locked &&
    !!inverseDelta(item.matrix, { x: 0, y: 0 }) &&
    item.primitives.length > 0 &&
    !scene.objects.some((child) => child.parentId === object.id) &&
    object.components.every((component) =>
      [
        "Transform",
        "SpriteRenderer",
        "Text",
        "UIImage",
        "UIPanel",
        "UIButton",
      ].includes(component.type),
    )
  );
}

/** One controller is owned by one mounted canvas. No reducer, React state,
 * history, I/O or canonical writes occur here; preview is projected per frame.
 */
export class GestureController {
  private gesture: {
    pointerId: number;
    scene: CanvasScene;
    objectId: string;
    componentId: string;
    start: Point;
    original: Transform;
    next: Transform;
    parent: Matrix2D;
    world: Matrix2D;
    resize: boolean;
  } | null = null;

  get pointerId() {
    return this.gesture?.pointerId ?? null;
  }
  begin(
    scene: CanvasScene,
    list: readonly RenderItem[],
    objectId: string,
    point: Point,
    pointerId: number,
    resize = false,
  ): boolean {
    if (this.gesture) return false;
    const object = scene.objects.find((object) => object.id === objectId);
    const item = list.find((item) => item.objectId === objectId);
    if (!object || !item || item.locked || (resize && !canResize(scene, item)))
      return false;
    const parent = object.parentId
      ? list.find((item) => item.objectId === object.parentId)?.matrix
      : identity;
    if (
      !parent ||
      !inverseDelta(parent, { x: 0, y: 0 }) ||
      !inverseDelta(item.matrix, { x: 0, y: 0 })
    )
      return false;
    const component = object.components.find(
      (component) => component.type === "Transform",
    )!;
    const original = structuredClone(component.properties) as Transform;
    this.gesture = {
      pointerId,
      scene,
      objectId,
      componentId: component.id,
      start: point,
      original,
      next: original,
      parent,
      world: item.matrix,
      resize,
    };
    return true;
  }

  move(point: Point, pointerId: number, snap: boolean, gridSize: number): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointerId) return;
    const { original, start, parent, world } = gesture;
    let delta = { x: point.x - start.x, y: point.y - start.y };
    if (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9) {
      gesture.next = original;
      return;
    }
    let next: Transform;
    if (gesture.resize) {
      const local = inverseDelta(world, delta);
      if (!local) return;
      let width = original.width + local.x,
        height = original.height + local.y;
      if (snap) {
        width = Math.round(width / gridSize) * gridSize;
        height = Math.round(height / gridSize) * gridSize;
      }
      width = Math.max(1, width);
      height = Math.max(1, height);
      const px = (width - original.width) * original.pivot.x;
      const py = (height - original.height) * original.pivot.y;
      const angle = (original.rotation * Math.PI) / 180;
      // Changing size moves the normalized pivot. Compensate local position so
      // the opposite local corner stays fixed without changing scale/rotation.
      next = {
        ...original,
        width,
        height,
        x:
          original.x +
          Math.cos(angle) * original.scaleX * px -
          Math.sin(angle) * original.scaleY * py -
          px,
        y:
          original.y +
          Math.sin(angle) * original.scaleX * px +
          Math.cos(angle) * original.scaleY * py -
          py,
      };
    } else {
      if (snap) {
        const origin = transformPoint(parent, original);
        delta = {
          x: Math.round((origin.x + delta.x) / gridSize) * gridSize - origin.x,
          y: Math.round((origin.y + delta.y) / gridSize) * gridSize - origin.y,
        };
      }
      const local = inverseDelta(parent, delta);
      if (!local) return;
      next = { ...original, x: original.x + local.x, y: original.y + local.y };
    }
    if (v2ComponentRegistry.Transform.schema.safeParse(next).success)
      gesture.next = next;
  }

  previewList(fallback: readonly RenderItem[]): readonly RenderItem[] {
    const gesture = this.gesture;
    if (!gesture || gesture.next === gesture.original) return fallback;
    const scene = {
      ...gesture.scene,
      objects: gesture.scene.objects.map((object) =>
        object.id !== gesture.objectId
          ? object
          : {
              ...object,
              components: object.components.map((component) =>
                component.id !== gesture.componentId
                  ? component
                  : { ...component, properties: gesture.next },
              ),
            },
      ),
    };
    return buildRenderList(scene);
  }

  finish(pointerId: number): StudioMutation | null {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointerId) return null;
    this.gesture = null;
    if (
      (["x", "y", "width", "height"] as const).every(
        (key) => Math.abs(gesture.next[key] - gesture.original[key]) < 1e-9,
      )
    )
      return null;
    return {
      type: "component.update",
      sceneId: gesture.scene.id,
      objectId: gesture.objectId,
      componentId: gesture.componentId,
      properties: gesture.next,
    };
  }
  cancel(): void {
    this.gesture = null;
  }
}
