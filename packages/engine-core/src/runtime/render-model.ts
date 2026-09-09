import { componentRegistry } from "../component-registry.js";
import type { StableId } from "../stable-id.js";
import type {
  ComponentInstanceV2,
  GameObjectV2,
  SceneV2,
} from "../v2/scene-schema.js";

export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
/** Canvas-compatible affine matrix: [a, b, c, d, e, f]. No DOM dependency. */
export type Matrix2D = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];
type PrimitiveBase = Bounds & { componentId: StableId; opacity: number };
export type RenderPrimitive = PrimitiveBase &
  (
    | {
        kind: "image";
        assetId: StableId | null;
        frame: string | null;
        flipX: boolean;
        flipY: boolean;
      }
    | {
        kind: "text";
        text: string;
        fontSize: number;
        color: string;
        align: "LEFT" | "CENTER" | "RIGHT";
      }
    | {
        kind: "shape";
        shape: "rectangle" | "ellipse";
        color: string;
        borderColor: string | null;
      }
    | {
        kind: "tiles";
        assetId: StableId | null;
        tileWidth: number;
        tileHeight: number;
        tiles: { x: number; y: number; tile: number }[];
      }
    | { kind: "placeholder"; label: string }
  );
export type RenderItem = {
  objectId: StableId;
  layerId: StableId;
  layerType: SceneV2["layers"][number]["type"];
  layerOrder: number;
  renderOrder: number;
  order: number;
  matrix: Matrix2D;
  bounds: Bounds;
  width: number;
  height: number;
  /** Editor metadata only. Drawing never consults this flag. */
  locked: boolean;
  primitives: RenderPrimitive[];
};
type Transform = Bounds & {
  rotation: number;
  scaleX: number;
  scaleY: number;
  pivot?: Point;
};

export function transformPoint(matrix: Matrix2D, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

function localMatrix(transform: Transform): Matrix2D {
  const angle = ((transform.rotation % 360) * Math.PI) / 180;
  const a = Math.cos(angle) * transform.scaleX;
  const b = Math.sin(angle) * transform.scaleX;
  const c = -Math.sin(angle) * transform.scaleY;
  const d = Math.cos(angle) * transform.scaleY;
  const px = (transform.pivot?.x ?? 0.5) * transform.width;
  const py = (transform.pivot?.y ?? 0.5) * transform.height;
  // T(position) × T(pivot) × R(degrees) × S × T(-pivot).
  return [
    a,
    b,
    c,
    d,
    transform.x + px - a * px - c * py,
    transform.y + py - b * px - d * py,
  ];
}

function primitives(
  component: ComponentInstanceV2,
  size: Bounds,
  collision: boolean,
): RenderPrimitive[] {
  const base = { ...size, componentId: component.id, opacity: 1 };
  const properties = component.properties;
  switch (component.type) {
    case "SpriteRenderer":
    case "UIImage": {
      const p = properties as {
        visible: boolean;
        opacity: number;
        assetId: string | null;
        frame?: string | null;
        flipX?: boolean;
        flipY?: boolean;
      };
      return p.visible && p.opacity > 0
        ? [
            {
              ...base,
              kind: "image",
              assetId: p.assetId,
              frame: p.frame ?? null,
              opacity: p.opacity,
              flipX: p.flipX ?? false,
              flipY: p.flipY ?? false,
            },
          ]
        : [];
    }
    case "Text": {
      const p = properties as {
        visible: boolean;
        text: string;
        fontSize: number;
        color: string;
        align: "LEFT" | "CENTER" | "RIGHT";
      };
      return p.visible && p.text
        ? [
            {
              ...base,
              kind: "text",
              text: p.text,
              fontSize: p.fontSize,
              color: p.color,
              align: p.align,
            },
          ]
        : [];
    }
    case "UIPanel": {
      const p = properties as {
        visible: boolean;
        opacity: number;
        backgroundColor: string;
        borderColor: string | null;
      };
      return p.visible && p.opacity > 0
        ? [
            {
              ...base,
              kind: "shape",
              shape: "rectangle",
              color: p.backgroundColor,
              borderColor: p.borderColor,
              opacity: p.opacity,
            },
          ]
        : [];
    }
    case "UIButton": {
      const p = properties as {
        visible: boolean;
        label: string;
        enabled: boolean;
      };
      return p.visible
        ? [
            {
              ...base,
              kind: "shape",
              shape: "rectangle",
              color: p.enabled ? "#285c85" : "#414858",
              borderColor: null,
            },
            {
              ...base,
              kind: "text",
              text: p.label,
              fontSize: 16,
              color: "#ffffff",
              align: "CENTER",
            },
          ]
        : [];
    }
    case "Collider": {
      if (!collision) return [];
      const p = properties as {
        shape: "RECTANGLE" | "CIRCLE";
        radius: number;
        width: number;
        height: number;
        offsetX: number;
        offsetY: number;
      };
      return [
        {
          ...base,
          kind: "shape",
          shape: p.shape === "CIRCLE" ? "ellipse" : "rectangle",
          x: p.offsetX,
          y: p.offsetY,
          width: p.shape === "CIRCLE" ? 2 * p.radius : p.width,
          height: p.shape === "CIRCLE" ? 2 * p.radius : p.height,
          color: "#e0a448",
          borderColor: "#ffd48a",
          opacity: 0.35,
        },
      ];
    }
    case "Tilemap": {
      const p = properties as {
        tilesetAssetId: string | null;
        tileWidth: number;
        tileHeight: number;
        columns: number;
        rows: number;
        tiles: { x: number; y: number; tile: number }[];
      };
      return [
        {
          ...base,
          kind: "tiles",
          assetId: p.tilesetAssetId,
          tileWidth: p.tileWidth,
          tileHeight: p.tileHeight,
          width: p.columns * p.tileWidth,
          height: p.rows * p.tileHeight,
          tiles: p.tiles.map((tile) => ({ ...tile })),
        },
      ];
    }
    case "Custom": {
      const p = properties as { definitionKey: string; config: unknown };
      // V1 keeps its original shape data in the established compatibility wrapper.
      if (p.definitionKey === "tfg.v1.shape") {
        const parsed = componentRegistry.Shape.schema.safeParse(p.config);
        if (parsed.success) {
          const shape = parsed.data as {
            width: number;
            height: number;
            color: string;
          };
          return [
            {
              ...base,
              ...shape,
              kind: "shape",
              shape: "rectangle",
              borderColor: null,
            },
          ];
        }
      }
      // Includes authored custom effect/particle definitions: a static marker,
      // never execution, animation, or a claim that their runtime exists.
      return [{ ...base, kind: "placeholder", label: p.definitionKey }];
    }
    default:
      return [];
  }
}

function worldBounds(matrix: Matrix2D, rectangles: readonly Bounds[]): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const rect of rectangles) {
    for (const point of [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ]) {
      const transformed = transformPoint(matrix, point);
      minX = Math.min(minX, transformed.x);
      minY = Math.min(minY, transformed.y);
      maxX = Math.max(maxX, transformed.x);
      maxY = Math.max(maxY, transformed.y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Projection of validated canonical input. Physical arrays are storage only.
 * Parent transforms and visibility compose across layers; component order within
 * an object remains its canonical component-array order. There is no UI state,
 * I/O, animation clock, or mutation in this projection.
 */
export function buildRenderList(scene: SceneV2): RenderItem[] {
  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const layers = new Map(scene.layers.map((layer) => [layer.id, layer]));
  type Resolved = {
    matrix: Matrix2D;
    visible: boolean;
    enabled: boolean;
    locked: boolean;
    transform: Transform;
  };
  const resolved = new Map<string, Resolved>();
  // Iterative parent walk avoids call-stack growth for the canonical 1,000 limit.
  for (const object of scene.objects) {
    const pending: GameObjectV2[] = [];
    let current: GameObjectV2 | undefined = object;
    while (current && !resolved.has(current.id)) {
      pending.push(current);
      current = current.parentId ? objects.get(current.parentId) : undefined;
    }
    while (pending.length) {
      const next = pending.pop()!;
      const parent = next.parentId ? resolved.get(next.parentId) : undefined;
      const layer = layers.get(next.layerId)!;
      const transform = next.components.find(
        (component) => component.type === "Transform",
      )!.properties as Transform;
      const local = localMatrix(transform);
      resolved.set(next.id, {
        transform,
        matrix: parent ? multiply(parent.matrix, local) : local,
        visible: (parent?.visible ?? true) && layer.visible && next.visible,
        enabled: (parent?.enabled ?? true) && next.enabled,
        locked: (parent?.locked ?? false) || layer.locked || next.locked,
      });
    }
  }
  const list: RenderItem[] = [];
  for (const object of scene.objects) {
    const value = resolved.get(object.id)!;
    if (
      !value.visible ||
      !value.enabled ||
      !value.matrix.every(Number.isFinite)
    )
      continue;
    const layer = layers.get(object.layerId)!;
    const size = {
      x: 0,
      y: 0,
      width: value.transform.width,
      height: value.transform.height,
    };
    const graphics = object.components.flatMap((component) =>
      primitives(component, size, layer.type === "COLLISION"),
    );
    const bounds = worldBounds(
      value.matrix,
      graphics.length ? graphics : [size],
    );
    // Deep legal local scales can overflow JS world geometry; never pass NaN or
    // infinities to a renderer or hit tester. Local canonical data stays intact.
    if (!Object.values(bounds).every(Number.isFinite)) continue;
    list.push({
      objectId: object.id,
      layerId: layer.id,
      layerType: layer.type,
      layerOrder: layer.order,
      renderOrder: object.renderOrder,
      order: object.order,
      matrix: value.matrix,
      bounds,
      width: size.width,
      height: size.height,
      locked: value.locked,
      primitives: graphics,
    });
  }
  return list.sort(
    (left, right) =>
      left.layerOrder - right.layerOrder ||
      left.renderOrder - right.renderOrder ||
      left.order - right.order ||
      (left.objectId < right.objectId
        ? -1
        : left.objectId > right.objectId
          ? 1
          : 0),
  );
}
