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

type TextBounds = { left: number; right: number; top: number; bottom: number };
async function semanticPixels(canvas: Locator, declaredBounds?: TextBounds[]) {
  return canvas.evaluate(async (element, declaredBounds) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const zoom = Number(canvas.dataset.cameraZoom) * window.devicePixelRatio;
    const cameraX = Number(canvas.dataset.cameraX);
    const cameraY = Number(canvas.dataset.cameraY);
    // Hand-declared canonical text fixtures. The custom placeholder's fill,
    // border and diagonals remain exact outside its measured glyph rectangle.
    const text = [
      { text: "TFG", x: 160, y: 180, width: 60, height: 30, size: 16 },
      {
        text: "effect.sparkles",
        x: 242,
        y: 192,
        width: 56,
        height: 28,
        size: 12,
      },
    ].map((item, index) => {
      context.save();
      context.font = `${item.size}px sans-serif`;
      context.textAlign = "left";
      context.textBaseline = "top";
      const metrics = context.measureText(item.text);
      context.restore();
      const compression = Math.min(1, item.width / metrics.width);
      // One physical pixel covers edge antialiasing; never exceed the clip.
      const left = Math.max(
        item.x,
        item.x - metrics.actualBoundingBoxLeft * compression,
      );
      const right = Math.min(
        item.x + item.width,
        item.x + metrics.actualBoundingBoxRight * compression,
      );
      const top = Math.max(item.y, item.y - metrics.actualBoundingBoxAscent);
      const bottom = Math.min(
        item.y + item.height,
        item.y + metrics.actualBoundingBoxDescent,
      );
      const bounds = declaredBounds?.[index] ?? {
        left: Math.max(
          Math.floor((item.x - cameraX) * zoom),
          Math.floor((left - cameraX) * zoom) - 1,
        ),
        right: Math.min(
          Math.ceil((item.x + item.width - cameraX) * zoom),
          Math.ceil((right - cameraX) * zoom) + 1,
        ),
        top: Math.max(
          Math.floor((item.y - cameraY) * zoom),
          Math.floor((top - cameraY) * zoom) - 1,
        ),
        bottom: Math.min(
          Math.ceil((item.y + item.height - cameraY) * zoom),
          Math.ceil((bottom - cameraY) * zoom) + 1,
        ),
      };
      return {
        bounds,
        ink: 0,
        columns: [0, 0, 0],
        cells: Array<number>(12).fill(0),
        samples: Array<number>(12).fill(0),
      };
    });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const geometry = [
      canvas.width,
      canvas.height,
      window.devicePixelRatio,
      canvas.getBoundingClientRect().width,
      canvas.getBoundingClientRect().height,
      canvas.dataset.cameraX,
      canvas.dataset.cameraY,
      canvas.dataset.cameraZoom,
    ];
    const redraw = async () => {
      window.dispatchEvent(new Event("resize"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (
        JSON.stringify([
          canvas.width,
          canvas.height,
          window.devicePixelRatio,
          canvas.getBoundingClientRect().width,
          canvas.getBoundingClientRect().height,
          canvas.dataset.cameraX,
          canvas.dataset.cameraY,
          canvas.dataset.cameraZoom,
        ]) !== JSON.stringify(geometry)
      )
        throw new Error(
          "Background pass changed canonical camera or raster dimensions",
        );
    };
    const originalFillText = Object.getOwnPropertyDescriptor(
      context,
      "fillText",
    );
    let omittedText = 0;
    let background: Uint8ClampedArray;
    try {
      // Suppress only glyph emission on this context, not primitives. The real
      // canvas redraw retains every fill/stroke, matrix, order, clip and DPR.
      context.fillText = () => {
        omittedText++;
      };
      await redraw();
      if (!omittedText)
        throw new Error("Background pass did not render the text fixture");
      background = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } finally {
      if (originalFillText)
        Object.defineProperty(context, "fillText", originalFillText);
      else Reflect.deleteProperty(context, "fillText");
      await redraw();
    }
    let invalidTextBackgroundPixels = 0;
    let outsideInk = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const x = (offset / 4) % canvas.width;
      const y = Math.floor(offset / 4 / canvas.width);
      const region = text.find(
        ({ bounds }) =>
          x >= bounds.left &&
          x < bounds.right &&
          y >= bounds.top &&
          y < bounds.bottom,
      );
      const white = Math.min(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
      );
      if (!region) {
        if (white > 240) outsideInk++;
        continue;
      }
      // Fixture glyphs are white on an opaque scene. Every masked pixel must
      // be its independently rendered background or a white glyph blend;
      // dark/color corruption is not an allowed antialiasing variation.
      const base = [...background.slice(offset, offset + 3)];
      const channel = base.indexOf(Math.min(...base));
      const alpha =
        (pixels[offset + channel] - base[channel]) / (255 - base[channel]);
      if (
        pixels[offset + 3] !== 255 ||
        background[offset + 3] !== 255 ||
        !(alpha >= 0 && alpha <= 1) ||
        base.some(
          (value, channel) =>
            Math.abs(
              pixels[offset + channel] - (value + alpha * (255 - value)),
            ) > 1,
        )
      )
        invalidTextBackgroundPixels++;
      const { bounds } = region;
      const column = Math.min(
        5,
        Math.floor(((x - bounds.left) * 6) / (bounds.right - bounds.left)),
      );
      const row = Math.min(
        1,
        Math.floor(((y - bounds.top) * 2) / (bounds.bottom - bounds.top)),
      );
      const cell = row * 6 + column;
      region.samples[cell]++;
      // Normalized bright-ink coverage ignores only native glyph AA variation.
      region.cells[cell] += Math.max(0, white - 200) / 55;
      if (white > 240) {
        region.ink++;
        region.columns[Math.floor(column / 2)]++;
      }
      pixels.fill(0, offset, offset + 4);
    }
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    const backgroundDigest = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(background),
    );
    return {
      width: canvas.width,
      height: canvas.height,
      exactOutsideText: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
      exactBackground: [...new Uint8Array(backgroundDigest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
      invalidTextBackgroundPixels,
      outsideInk,
      text: text.map(({ bounds, ink, columns, cells, samples }) => ({
        bounds,
        ink,
        columns,
        coverage: cells.map((value, index) => value / samples[index]),
      })),
    };
  }, declaredBounds);
}

function expectTextInk(snapshot: Awaited<ReturnType<typeof semanticPixels>>) {
  expect(snapshot.invalidTextBackgroundPixels).toBe(0);
  expect(snapshot.outsideInk).toBe(0);
  for (const text of snapshot.text) {
    expect(text.ink).toBeGreaterThan(10);
    // Both declared strings have bright ink in left, middle and right thirds.
    for (const column of text.columns) expect(column).toBeGreaterThan(0);
  }
}

function expectSameScenePixels(
  before: Awaited<ReturnType<typeof semanticPixels>>,
  after: Awaited<ReturnType<typeof semanticPixels>>,
) {
  expectTextInk(before);
  expectTextInk(after);
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  expect(after.exactOutsideText).toBe(before.exactOutsideText);
  expect(after.exactBackground).toBe(before.exactBackground);
  after.text.forEach((text, index) => {
    expect(text.bounds).toEqual(before.text[index].bounds);
    text.coverage.forEach((coverage, cell) =>
      expect(
        Math.abs(coverage - before.text[index].coverage[cell]),
      ).toBeLessThanOrEqual(0.04),
    );
  });
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
  await expect(page.getByRole("main", { name: "Xưởng sáng tạo trò chơi" })).toBeVisible();
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
  // Grid gestures have their own native coverage; this fixture isolates the
  // canonical renderer so white glyphs have an independent opaque background.
  source.settings.grid.enabled = false;
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
              settings: source.settings,
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
  const canvas = page.getByRole("img", { name: "Cảnh: Canonical Canvas" });
  await expect(canvas).toBeVisible();
  return { gameId, canvas, project: saved.project as EngineProjectV2Type };
}

test("official canonical revisions preserve geometry, text regions and exact non-text pixels across reload", async ({
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
  await page.screenshot({
    path: testInfo.outputPath("canonical-canvas-initial.png"),
    fullPage: false,
  });
  const before = await semanticPixels(canvas);
  expectTextInk(before);
  await page.reload();
  for (const [x, y, rgba] of expected)
    await expect.poll(() => pixel(canvas, x, y)).toEqual(rgba);
  await page.screenshot({
    path: testInfo.outputPath("canonical-canvas-reloaded.png"),
    fullPage: false,
  });
  // Declare one clipped glyph mask/coverage grid for both snapshots. Chrome's
  // native hinted TextMetrics can itself vary after repeated raster readback.
  const after = await semanticPixels(
    canvas,
    before.text.map(({ bounds }) => bounds),
  );
  await testInfo.attach("native-text-coverage", {
    contentType: "application/json",
    body: JSON.stringify({ before, after }),
  });
  expectSameScenePixels(before, after);
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

test("native pixel oracle rejects dark placeholder corruption inside glyph bounds", async ({
  page,
}) => {
  const { canvas } = await setup(page);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const before = await semanticPixels(canvas);
  const changed = await canvas.evaluate((element, bounds) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let changed = 0;
    for (let y = bounds.top; y < bounds.bottom; y++) {
      for (let x = bounds.left; x < bounds.right; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (Math.min(...image.data.slice(offset, offset + 3)) > 200) continue;
        image.data.set([80, 0, 0, 255], offset);
        changed++;
      }
    }
    context.putImageData(image, 0, 0);
    return changed;
  }, before.text[1].bounds);
  expect(changed).toBeGreaterThan(1000);
  const corrupted = await semanticPixels(
    canvas,
    before.text.map(({ bounds }) => bounds),
  );
  expect(corrupted).not.toEqual(before);
  expect(corrupted.invalidTextBackgroundPixels).toBe(changed);
  expect(() => expectSameScenePixels(before, corrupted)).toThrow();
});

test("native pixel oracle accepts one-byte white glyph rounding variation", async ({
  page,
}) => {
  const { canvas } = await setup(page);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const before = await semanticPixels(canvas);
  const changed = await canvas.evaluate((element, bounds) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let changed = 0;
    for (let y = bounds.top; y < bounds.bottom; y++) {
      for (let x = bounds.left; x < bounds.right; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (
          !image.data.slice(offset, offset + 3).every((value) => value === 255)
        )
          continue;
        image.data.set([254, 254, 254, 255], offset);
        changed++;
      }
    }
    context.putImageData(image, 0, 0);
    return changed;
  }, before.text[1].bounds);
  expect(changed).toBeGreaterThan(100);
  const rounded = await semanticPixels(
    canvas,
    before.text.map(({ bounds }) => bounds),
  );
  expectSameScenePixels(before, rounded);
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
