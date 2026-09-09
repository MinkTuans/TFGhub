import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  EngineProjectV2,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";

test.skip(
  process.env.E2E_EXTERNAL_SERVICES !== "1" ||
    process.env.E2E_STUDIO_RENDERER !== "1",
  "Renderer persistence tests require an explicitly selected disposable PostgreSQL/API stack",
);
test.use({ deviceScaleFactor: 2 });

type Scene = EngineProjectV2Type["scenes"][number];
type Component = Scene["objects"][number]["components"][number];
const component = (type: Component["type"], properties = {}): Component => ({
  id: randomUUID(),
  type,
  version: 1,
  properties: {
    ...(v2ComponentRegistry[type].defaults() as object),
    ...properties,
  },
});
function shape(
  layerId: string,
  order: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): Scene["objects"][number] {
  return {
    id: randomUUID(),
    name: `Shape ${order}`,
    objectType: "DECORATION",
    layerId,
    parentId: null,
    order,
    renderOrder: 0,
    enabled: true,
    visible: true,
    locked: false,
    components: [
      component("Transform", { x, y, width, height }),
      component("Custom", {
        definitionKey: "tfg.v1.shape",
        config: { kind: "RECTANGLE", width, height, color },
      }),
    ],
  };
}
async function pixel(canvas: Locator, x: number, y: number): Promise<number[]> {
  return canvas.evaluate(
    (element, point) => {
      const canvas = element as HTMLCanvasElement;
      const scale = Math.min(canvas.width / 320, canvas.height / 240);
      const px = Math.floor((canvas.width - 320 * scale) / 2 + point.x * scale);
      const py = Math.floor((canvas.height - 240 * scale) / 2 + point.y * scale);
      return [...canvas.getContext("2d")!.getImageData(px, py, 1, 1).data];
    },
    { x, y },
  );
}
async function setup(page: Page) {
  const suffix = randomUUID();
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `renderer-${suffix}@example.test`,
      password: "renderer-password123",
    },
  });
  expect(registration.status()).toBe(201);
  await page.goto("/studio/games/new");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page.getByRole("main", { name: "Game Studio" })).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const gameId = page.url().split("/").at(-1)!;
  const read = await (
    await page.request.get(`/api/games/${gameId}/engine-project`)
  ).json();
  const project = EngineProjectV2.parse(read.project);
  const source = project.scenes[0];
  const ground = source.layers[0];
  const front = { ...ground, id: randomUUID(), name: "Objects", order: 10 };
  const ui = {
    ...ground,
    id: randomUUID(),
    name: "UI",
    order: 20,
    type: "UI" as const,
    locked: true,
  };
  const parent = shape(front.id, 2, 100, 50, 40, 20, "#000000");
  parent.objectType = "GROUP";
  parent.components = [
    component("Transform", {
      x: 100,
      y: 50,
      width: 40,
      height: 20,
      rotation: 90,
      scaleX: 2,
      pivot: { x: 0, y: 0 },
    }),
  ];
  const child = shape(front.id, 3, 10, 0, 20, 10, "#ffff00");
  child.parentId = parent.id;
  Object.assign(child.components[0].properties, {
    scaleX: -1,
    pivot: { x: 0, y: 0 },
  });
  const hidden = shape(front.id, 4, 150, 90, 20, 20, "#ff00ff");
  hidden.visible = false;
  const hiddenChild = shape(front.id, 5, 0, 0, 20, 20, "#ff00ff");
  hiddenChild.parentId = hidden.id;
  const disabled = shape(front.id, 6, 180, 90, 20, 20, "#ff00ff");
  disabled.enabled = false;
  const disabledChild = shape(front.id, 7, 0, 0, 20, 20, "#ff00ff");
  disabledChild.parentId = disabled.id;
  const rotated = shape(front.id, 8, 120, 120, 40, 20, "#ff8000");
  rotated.components[0].properties.rotation = 90;
  const image = shape(front.id, 9, 240, 150, 20, 20, "#000000");
  image.components[1] = component("SpriteRenderer");
  const groundShape = shape(ground.id, 0, 20, 20, 50, 50, "#ff0000");
  groundShape.locked = true;
  groundShape.renderOrder = 100;
  const frontShape = shape(front.id, 0, 20, 20, 50, 50, "#0000ff");
  frontShape.renderOrder = -100;
  const topShape = shape(front.id, 1, 30, 30, 20, 20, "#00ff00");
  topShape.renderOrder = -100;
  const locked = shape(ui.id, 0, 210, 20, 40, 40, "#00ffff");
  locked.components[1] = component("UIPanel", { backgroundColor: "#00ffff" });
  const label = shape(ui.id, 1, 160, 180, 60, 30, "#ffffff");
  label.components[1] = component("Text", { text: "TFG", fontSize: 16 });
  const tiles = shape(front.id, 10, 10, 150, 32, 32, "#000000");
  tiles.components[0].properties.pivot = { x: 0, y: 0 };
  tiles.components[1] = component("Tilemap", {
    columns: 4,
    rows: 4,
    tileWidth: 8,
    tileHeight: 8,
    tiles: [{ x: 1, y: 1, tile: 0 }],
  });
  const effect = shape(front.id, 11, 240, 190, 60, 30, "#000000");
  effect.components[1] = component("Custom", {
    definitionKey: "effect.sparkles",
  });
  source.width = 320;
  source.height = 240;
  source.background = { color: "#102030", assetId: null };
  source.name = "Canonical Canvas";
  source.layers = [ui, front, { ...ground, name: "Ground" }];
  // Forward parent references and physical order deliberately differ from draw order.
  source.objects = [
    child,
    hiddenChild,
    disabledChild,
    rotated,
    image,
    topShape,
    parent,
    hidden,
    disabled,
    frontShape,
    groundShape,
    locked,
    label,
    tiles,
    effect,
  ];
  const response = await page.request.post(
    `/api/games/${gameId}/engine-project/mutations`,
    {
      data: {
        baseRevision: read.revision.revisionNumber,
        mutationId: randomUUID(),
        mutations: [
          {
            type: "scene.update",
            sceneId: source.id,
            changes: {
              width: 320,
              height: 240,
              name: source.name,
              background: source.background,
            },
          },
          {
            type: "layer.update",
            sceneId: source.id,
            layerId: ground.id,
            changes: { name: "Ground" },
          },
          ...[ui, front].map((layer) => ({
            type: "layer.create",
            sceneId: source.id,
            layer,
            objects: [],
            beforeLayerId: ground.id,
          })),
          {
            type: "object.create",
            sceneId: source.id,
            objects: source.objects.map((object, index) => ({
              object,
              beforeObjectId: source.objects[index + 1]?.id ?? null,
            })),
          },
        ],
      },
    },
  );
  expect(response.status(), await response.text()).toBe(201);
  const saved = await (
    await page.request.get(`/api/games/${gameId}/engine-project`)
  ).json();
  expect(saved.project).toEqual(EngineProjectV2.parse(project));
  await page.reload();
  const canvas = page.getByRole("img", { name: "Scene: Canonical Canvas" });
  await expect(canvas).toBeVisible();
  return { gameId, canvas, project: saved.project as EngineProjectV2Type };
}

test("official canonical revisions render real pixels for ordering, local hierarchy, pivots, visibility and locks and reload exactly", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { gameId, canvas, project } = await setup(page);
  const viewport = await canvas.boundingBox();
  expect(viewport!.y + viewport!.height).toBeLessThanOrEqual(900);
  const expected: [number, number, number[]][] = [
    [25, 25, [0, 0, 255, 255]],
    [40, 40, [0, 255, 0, 255]],
    [95, 50, [255, 255, 0, 255]],
    [155, 95, [16, 32, 48, 255]],
    [185, 95, [16, 32, 48, 255]],
    [140, 120, [255, 128, 0, 255]],
    [121, 121, [16, 32, 48, 255]],
    [220, 30, [0, 255, 255, 255]],
    [244, 153, [57, 73, 98, 255]],
    [19, 162, [57, 73, 98, 255]],
    [265, 213, [57, 73, 98, 255]],
  ];
  for (const [x, y, rgba] of expected)
    await expect.poll(() => pixel(canvas, x, y)).toEqual(rgba);
  expect(
    await canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const scale = Math.min(canvas.width / 320, canvas.height / 240);
      const x = Math.floor((canvas.width - 320 * scale) / 2 + 160 * scale);
      const y = Math.floor((canvas.height - 240 * scale) / 2 + 180 * scale);
      const pixels = canvas
        .getContext("2d")!
        .getImageData(
          x,
          y,
          Math.floor(60 * scale),
          Math.floor(30 * scale),
        ).data;
      let white = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (
          pixels[index] > 240 &&
          pixels[index + 1] > 240 &&
          pixels[index + 2] > 240
        )
          white++;
      return white;
    }),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("canonical-canvas-initial.png"),
    fullPage: false,
  });
  const before = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );
  await page.reload();
  // Exercise the same native readback sequence before full-image equality.
  // Asymmetric repeated reads can change Chrome's text rasterization path.
  for (const [x, y, rgba] of expected)
    await expect.poll(() => pixel(canvas, x, y)).toEqual(rgba);
  await page.screenshot({
    path: testInfo.outputPath("canonical-canvas-reloaded.png"),
    fullPage: false,
  });
  await expect
    .poll(() =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()),
    )
    .toBe(before);
  const read = await (
    await page.request.get(`/api/games/${gameId}/engine-project`)
  ).json();
  expect(read.project).toEqual(project);
  expect(read.revision.revisionNumber).toBe(1);
  // Existing layer form authoring is the official optimistic/recovery flow.
  const layer = page.getByRole("group", { name: "Objects", exact: true });
  await layer.getByRole("checkbox", { name: "Hiện lớp" }).uncheck();
  await layer.getByRole("button", { name: "Lưu lớp" }).click();
  await expect.poll(() => pixel(canvas, 40, 40)).toEqual([255, 0, 0, 255]);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await page.reload();
  await expect.poll(() => pixel(canvas, 95, 50)).toEqual([16, 32, 48, 255]);
  await expect.poll(() => pixel(canvas, 40, 40)).toEqual([255, 0, 0, 255]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("canonical-canvas.png"),
    fullPage: true,
  });
});

test("native Canvas2D uses physical backing pixels at DPR 2 and clips scene margins", async ({
  page,
}) => {
  const { canvas } = await setup(page);
  const geometry = await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const data = canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data;
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      dpr: devicePixelRatio,
      corner: [...data],
    };
  });
  expect(geometry.width).toBe(Math.round(geometry.cssWidth * geometry.dpr));
  expect(geometry.dpr).toBe(2);
  expect(geometry.height).toBe(Math.round(geometry.cssHeight * geometry.dpr));
  await expect.poll(() => pixel(canvas, 40, 40)).toEqual([0, 255, 0, 255]);
  // Fitting preserves the scene aspect ratio and leaves transparent margins.
  expect(geometry.corner).toEqual([0, 0, 0, 0]);
});

test("pending layer visibility recovers in the real Studio after reload and saves the same local scene", async ({
  page,
}) => {
  const { gameId, canvas, project } = await setup(page);
  await page.route(`**/api/games/${gameId}/engine-project/mutations`, (route) =>
    route.abort(),
  );
  const layer = page.getByRole("group", { name: "Objects", exact: true });
  await layer.getByRole("checkbox", { name: "Hiện lớp" }).uncheck();
  await layer.getByRole("button", { name: "Lưu lớp" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Chưa đồng bộ");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const opening = indexedDB.open("tfg-studio-recovery", 1);
            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const db = opening.result;
              const request = db
                .transaction("projects")
                .objectStore("projects")
                .getAll();
              request.onsuccess = () => {
                resolve(request.result.some((entry) => entry.pending !== null));
                db.close();
              };
              request.onerror = () => {
                reject(request.error);
                db.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect.poll(() => pixel(canvas, 40, 40)).toEqual([255, 0, 0, 255]);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Chưa đồng bộ");
  await page.unroute(`**/api/games/${gameId}/engine-project/mutations`);
  await page.getByRole("button", { name: "Thử đồng bộ lại" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  project.scenes[0].layers.find((layer) => layer.name === "Objects")!.visible =
    false;
  const saved = await (
    await page.request.get(`/api/games/${gameId}/engine-project`)
  ).json();
  expect(saved.project).toEqual(project);
  await page.reload();
  await expect.poll(() => pixel(canvas, 40, 40)).toEqual([255, 0, 0, 255]);
});
