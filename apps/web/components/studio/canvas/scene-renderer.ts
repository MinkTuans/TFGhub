import { BUILTIN_PIXEL_SPRITES } from "@indieforge/contracts";
import type {
  Bounds,
  EngineProjectV2Type,
  RenderItem,
  RenderPrimitive,
} from "@indieforge/contracts";
import { validateCamera, type Camera2D } from "./coordinates";

export type RenderSceneOptions = {
  pixelRatio?: number;
  pixelArt?: boolean;
  surface?: Pick<
    EngineProjectV2Type["scenes"][number],
    "width" | "height" | "background"
  >;
  /** Already available images only. This renderer never loads or fetches assets.
   * Named sprite frames and tile atlas resolution belong to the asset boundary.
   */
  images?: ReadonlyMap<string, CanvasImageSource>;
};

function intersects(left: Bounds, right: Bounds): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

function clip(context: CanvasRenderingContext2D, bounds: Bounds): void {
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.clip();
}

function placeholder(
  context: CanvasRenderingContext2D,
  bounds: Bounds,
  label?: string,
): void {
  const { x, y, width, height } = bounds;
  context.fillStyle = "#394962";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#93aac2";
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y + height);
  context.moveTo(x + width, y);
  context.lineTo(x, y + height);
  context.stroke();
  if (label && width > 4 && height > 4) {
    context.fillStyle = "#ffffff";
    context.font = "12px sans-serif";
    context.textBaseline = "top";
    context.textAlign = "left";
    context.fillText(label, x + 2, y + 2, width - 4);
  }
}

function drawImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  bounds: Bounds,
): boolean {
  if (
    !image ||
    ("complete" in image && (!image.complete || image.naturalWidth === 0))
  )
    return false;
  try {
    context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  } catch {
    // A closed bitmap or unavailable image must not abort drawing later objects.
    return false;
  }
}

function drawPrimitive(
  context: CanvasRenderingContext2D,
  primitive: RenderPrimitive,
  images: RenderSceneOptions["images"],
): void {
  context.save();
  try {
    clip(context, primitive);
    context.globalAlpha = primitive.opacity;
    const { x, y, width, height } = primitive;
    switch (primitive.kind) {
      case "image": {
        context.translate(
          x + (primitive.flipX ? width : 0),
          y + (primitive.flipY ? height : 0),
        );
        context.scale(primitive.flipX ? -1 : 1, primitive.flipY ? -1 : 1);
        const rect = { x: 0, y: 0, width, height };
        const image =
          primitive.assetId && !primitive.frame
            ? images?.get(primitive.assetId)
            : undefined;
        const builtin = !primitive.assetId && primitive.frame ? BUILTIN_PIXEL_SPRITES[primitive.frame] : undefined;
        if (builtin) {
          const pw = width / builtin.width, ph = height / builtin.height;
          builtin.pixels.forEach((row, py) => [...row].forEach((color, px) => {
            if (color === "." || !builtin.palette[color]) return;
            context.fillStyle = builtin.palette[color]!;
            context.fillRect(px * pw, py * ph, pw, ph);
          }));
        } else if (!drawImage(context, image, rect)) placeholder(context, rect);
        break;
      }
      case "shape":
        context.fillStyle = primitive.color;
        if (primitive.shape === "ellipse") {
          context.beginPath();
          context.ellipse(
            x + width / 2,
            y + height / 2,
            width / 2,
            height / 2,
            0,
            0,
            2 * Math.PI,
          );
          context.fill();
        } else context.fillRect(x, y, width, height);
        if (primitive.borderColor) {
          context.strokeStyle = primitive.borderColor;
          if (primitive.shape === "ellipse") context.stroke();
          else context.strokeRect(x, y, width, height);
        }
        break;
      case "text":
        context.font = `${primitive.fontSize}px sans-serif`;
        context.fillStyle = primitive.color;
        context.textAlign =
          primitive.align === "LEFT"
            ? "left"
            : primitive.align === "RIGHT"
              ? "right"
              : "center";
        context.textBaseline = "top";
        context.fillText(
          primitive.text,
          x +
            (primitive.align === "LEFT"
              ? 0
              : primitive.align === "RIGHT"
                ? width
                : width / 2),
          y,
          width,
        );
        break;
      case "tiles":
        for (const tile of primitive.tiles)
          placeholder(context, {
            x: x + tile.x * primitive.tileWidth,
            y: y + tile.y * primitive.tileHeight,
            width: primitive.tileWidth,
            height: primitive.tileHeight,
          });
        break;
      case "placeholder":
        placeholder(context, primitive, primitive.label);
        break;
    }
  } finally {
    context.restore();
  }
}

/** Stateless Canvas2D adapter. Lock/selection/gestures never affect drawing. */
export function renderScene(
  context: CanvasRenderingContext2D,
  list: readonly RenderItem[],
  camera: Camera2D,
  options: RenderSceneOptions = {},
): void {
  validateCamera(camera);
  const ratio = options.pixelRatio ?? 1;
  const zoom = camera.zoom * ratio;
  if (
    ratio <= 0 ||
    ![
      ratio,
      zoom,
      camera.viewportWidth * ratio,
      camera.viewportHeight * ratio,
      camera.x * zoom,
      camera.y * zoom,
    ].every(Number.isFinite)
  )
    throw new RangeError(
      "Device pixel ratio and raster camera must be finite and positive",
    );
  const viewport = {
    x: camera.x,
    y: camera.y,
    width: camera.viewportWidth / camera.zoom,
    height: camera.viewportHeight / camera.zoom,
  };
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    context.filter = "none";
    context.lineWidth = 1;
    context.setLineDash([]);
    context.imageSmoothingEnabled = !options.pixelArt;
    clip(context, {
      x: 0,
      y: 0,
      width: camera.viewportWidth * ratio,
      height: camera.viewportHeight * ratio,
    });
    context.setTransform(zoom, 0, 0, zoom, -camera.x * zoom, -camera.y * zoom);
    const surface = options.surface;
    if (surface) {
      const rect = { x: 0, y: 0, width: surface.width, height: surface.height };
      clip(context, rect);
      context.fillStyle = surface.background.color;
      context.fillRect(0, 0, surface.width, surface.height);
      if (
        surface.background.assetId &&
        !drawImage(
          context,
          options.images?.get(surface.background.assetId),
          rect,
        )
      )
        placeholder(context, rect);
    }
    for (const item of list) {
      if (!intersects(item.bounds, viewport)) continue;
      context.save();
      try {
        context.transform(...item.matrix);
        for (const primitive of item.primitives)
          drawPrimitive(context, primitive, options.images);
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
}
