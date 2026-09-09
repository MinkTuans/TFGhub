import {
  applyProjectMutations,
  buildRenderList,
  v2ComponentRegistry,
  type EngineProjectV2Type,
  type Matrix2D,
  type Point,
} from "@indieforge/contracts";
import {
  addComponentCommand,
  createObjectCommand,
  updateComponentCommand,
} from "./object-commands";
import { createStudioId } from "./studio-provider";
import { clientToWorld, type Camera2D } from "./canvas/coordinates";
import type { StudioMutation } from "./studio-state";

export const STUDIO_ASSET_MIME = "application/x-tfg-asset";
export type AssetDropMetadata = {
  id: string;
  projectId: string;
  state: "READY";
  kind: "IMAGE";
  name: string;
  width: number;
  height: number;
};
const roles = ["IMAGE", "SPRITE", "ITEM", "UI"] as const;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function localPoint(matrix: Matrix2D, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const determinant = (a / scale) * (d / scale) - (b / scale) * (c / scale);
  const x = (point.x - e) / scale,
    y = (point.y - f) / scale;
  const local = {
    x: ((d / scale) * x - (c / scale) * y) / determinant,
    y: ((a / scale) * y - (b / scale) * x) / determinant,
  };
  if (!Number.isFinite(local.x) || !Number.isFinite(local.y))
    throw new Error("Không thể đặt vào đối tượng cha này.");
  return local;
}

/** Trusted metadata is supplied separately by the library boundary. Payloads
 * never supply URLs, geometry, ownership or lifecycle assertions. Until Task19
 * consumers can inject fixtures; production has no synthetic asset catalog. */
export function createAssetDrop({
  document,
  sceneId,
  layerId,
  parentId,
  payload,
  metadata,
  client,
  rect,
  camera,
  newId = createStudioId,
}: {
  document: EngineProjectV2Type;
  sceneId: string;
  layerId: string;
  parentId: string | null;
  payload: string;
  metadata: readonly unknown[];
  client: Point;
  rect: { left: number; top: number; width: number; height: number };
  camera: Camera2D;
  newId?: () => string;
}) {
  if (payload.length > 512) throw new Error("Dữ liệu kéo thả không hợp lệ.");
  const value: unknown = JSON.parse(payload);
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== "assetId,role" ||
    typeof value.assetId !== "string" ||
    !roles.includes(value.role as (typeof roles)[number]) ||
    !document.assetIds.includes(value.assetId)
  )
    throw new Error("Asset kéo thả chưa được khai báo trong dự án.");
  const matches = metadata.filter(
    (item) => record(item) && item.id === value.assetId,
  );
  const asset = matches[0];
  if (
    matches.length !== 1 ||
    !record(asset) ||
    asset.projectId !== document.projectId ||
    asset.state !== "READY" ||
    asset.kind !== "IMAGE" ||
    typeof asset.name !== "string" ||
    !asset.name.trim() ||
    asset.name.length > 80 ||
    typeof asset.width !== "number" ||
    typeof asset.height !== "number" ||
    !Number.isSafeInteger(asset.width) ||
    !Number.isSafeInteger(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0
  )
    throw new Error("Asset không sẵn sàng hoặc không thuộc dự án.");
  const scene = document.scenes.find((scene) => scene.id === sceneId);
  const layer = scene?.layers.find((layer) => layer.id === layerId);
  if (!scene || !layer || !layer.visible || layer.locked)
    throw new Error("Lớp nhận asset bị ẩn, khóa hoặc không tồn tại.");
  if (
    client.x < rect.left ||
    client.x > rect.left + rect.width ||
    client.y < rect.top ||
    client.y > rect.top + rect.height
  )
    throw new Error("Thả asset bên trong Canvas.");
  let world = clientToWorld(client, rect, camera);
  if (
    world.x < 0 ||
    world.y < 0 ||
    world.x > scene.width ||
    world.y > scene.height
  )
    throw new Error("Thả asset bên trong Scene.");
  if (scene.settings.grid.snap)
    world = {
      x:
        Math.round(world.x / scene.settings.grid.size) *
        scene.settings.grid.size,
      y:
        Math.round(world.y / scene.settings.grid.size) *
        scene.settings.grid.size,
    };
  const parent = parentId
    ? buildRenderList(scene).find((item) => item.objectId === parentId)
    : null;
  if (parentId && (!parent || parent.locked))
    throw new Error("Đối tượng cha bị ẩn, khóa hoặc không tồn tại.");
  const position = parent ? localPoint(parent.matrix, world) : world;
  const creation = createObjectCommand(
    scene,
    {
      name: asset.name,
      layerId,
      parentId,
      objectType:
        value.role === "ITEM"
          ? "ITEM"
          : value.role === "UI"
            ? "UI"
            : "DECORATION",
      transform: { ...position, width: asset.width, height: asset.height },
    },
    newId,
  );
  if (creation.type !== "object.create")
    throw new Error("Invalid object creation command");
  const object = creation.objects[0].object;
  const mutations: StudioMutation[] = [creation];
  for (const component of object.components) {
    if (
      component.type === "SpriteRenderer" ||
      component.type === "InventoryItem"
    )
      mutations.push(
        updateComponentCommand(sceneId, object.id, component.id, {
          ...(component.properties as object),
          [component.type === "InventoryItem" ? "iconAssetId" : "assetId"]:
            asset.id,
        }),
      );
  }
  if (value.role === "UI")
    mutations.push(
      addComponentCommand(
        sceneId,
        object.id,
        "UIImage",
        {
          ...(v2ComponentRegistry.UIImage.defaults() as object),
          assetId: asset.id,
        },
        newId,
      ),
    );
  // Same semantic checks as every editor/API command, including allowed layers.
  applyProjectMutations(document, mutations);
  return { objectId: object.id, mutations };
}
