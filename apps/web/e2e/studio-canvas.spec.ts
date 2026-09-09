import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  EngineProjectV2,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";

test.skip(
  process.env.E2E_EXTERNAL_SERVICES !== "1" ||
    process.env.E2E_STUDIO_CANVAS !== "1",
  "Canvas revision tests require a disposable PostgreSQL/API stack",
);
test.use({ deviceScaleFactor: 2 });
type Scene = EngineProjectV2Type["scenes"][number];
async function setup(page: Page, mainName = "Editable panel") {
  const register = await page.request.post("/api/auth/register", {
    data: {
      email: `canvas-${randomUUID()}@example.test`,
      password: "canvas-password123",
    },
  });
  expect(register.status()).toBe(201);
  await page.goto("/studio/games/new");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const gameId = page.url().split("/").at(-1)!;
  const read = await (
    await page.request.get(`/api/games/${gameId}/engine-project`)
  ).json();
  const project = EngineProjectV2.parse(read.project),
    scene = project.scenes[0];
  const layer = {
    ...scene.layers[0],
    id: randomUUID(),
    name: "Canvas UI",
    type: "UI",
    order: 10,
  };
  function panel(name: string, x: number, y: number): Scene["objects"][number] {
    return {
      id: randomUUID(),
      name,
      objectType: "UI",
      parentId: null,
      layerId: layer.id,
      enabled: true,
      visible: true,
      locked: false,
      order: 0,
      renderOrder: 0,
      components: [
        {
          id: randomUUID(),
          type: "Transform",
          version: 1,
          properties: {
            ...(v2ComponentRegistry.Transform.defaults() as object),
            x,
            y,
            width: 40,
            height: 30,
          },
        },
        {
          id: randomUUID(),
          type: "UIPanel",
          version: 1,
          properties: {
            ...(v2ComponentRegistry.UIPanel.defaults() as object),
            backgroundColor: "#00ff00",
            borderColor: null,
          },
        },
      ],
    };
  }
  const main = panel(mainName, 40, 40),
    locked = panel("Locked panel", 120, 40),
    hidden = panel("Hidden panel", 170, 40),
    disabled = panel("Disabled panel", 220, 40);
  locked.locked = true;
  hidden.visible = false;
  disabled.enabled = false;
  const parent = panel("Parent", 200, 120);
  parent.objectType = "GROUP";
  parent.components.splice(1);
  Object.assign(parent.components[0].properties, {
    rotation: 90,
    scaleX: 2,
    scaleY: -1,
    pivot: { x: 0, y: 0 },
  });
  const child = panel("Child", 10, 20);
  child.parentId = parent.id;
  Object.assign(child.components[0].properties, { width: 20, height: 10 });
  const objects = [child, disabled, hidden, locked, parent, main];
  objects.forEach((object, order) => {
    object.order = order;
    object.renderOrder = order;
  });
  const saved = await page.request.post(
    `/api/games/${gameId}/engine-project/mutations`,
    {
      data: {
        baseRevision: read.revision.revisionNumber,
        mutationId: randomUUID(),
        mutations: [
          {
            type: "scene.update",
            sceneId: scene.id,
            changes: {
              name: "Gesture Canvas",
              width: 320,
              height: 240,
              settings: {
                ...scene.settings,
                grid: { enabled: false, size: 32, snap: false },
              },
            },
          },
          {
            type: "layer.create",
            sceneId: scene.id,
            layer,
            objects: [],
            beforeLayerId: null,
          },
          {
            type: "object.create",
            sceneId: scene.id,
            objects: objects.map((object, index) => ({
              object,
              beforeObjectId: objects[index + 1]?.id ?? null,
            })),
          },
        ],
      },
    },
  );
  expect(saved.status(), await saved.text()).toBe(201);
  await page.reload();
  const canvas = page.getByRole("img", { name: "Scene: Gesture Canvas" });
  await expect(canvas).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const requests: {
    mutations: {
      type: string;
      objectId: string;
      properties: Record<string, unknown>;
    }[];
  }[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/engine-project/mutations")
    )
      requests.push(request.postDataJSON());
  });
  const head = async () =>
    await (
      await page.request.get(`/api/games/${gameId}/engine-project`)
    ).json();
  const baseline = await head();
  return { canvas, main, locked, child, requests, head, baseline };
}
async function client(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (element, world) => {
      const rect = element.getBoundingClientRect();
      const zoom =
        Number((element as HTMLElement).dataset.cameraZoom) ||
        Math.min(rect.width / 320, rect.height / 240);
      const cameraX =
        Number((element as HTMLElement).dataset.cameraX) ||
        -(rect.width / zoom - 320) / 2;
      const cameraY =
        Number((element as HTMLElement).dataset.cameraY) ||
        -(rect.height / zoom - 240) / 2;
      return {
        x: rect.left + (world.x - cameraX) * zoom,
        y: rect.top + (world.y - cameraY) * zoom,
      };
    },
    { x, y },
  );
}

for (const modifier of ["Control", "Meta"]) {
  test(`native resize-handle ${modifier} undo/redo after mouse, Enter and Tab`, async ({
    page,
  }) => {
    const app = await setup(page);
    const point = await client(app.canvas, 50, 50);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole("treeitem", {
        name: "Editable panel",
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(app.canvas).toBeFocused();
    await page.keyboard.press("Tab");
    const handle = page.getByRole("button", {
      name: "Đổi kích thước",
      exact: true,
    });
    await expect(handle).toBeFocused();
    const width = page.getByRole("spinbutton", { name: "width", exact: true });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(width).toHaveValue("42");
    await page.keyboard.press(`${modifier}+z`);
    await expect(width).toHaveValue("41");
    await page.keyboard.press(`${modifier}+Shift+z`);
    await expect(width).toHaveValue("42");
    await page.keyboard.press(`${modifier}+z`);
    await expect(width).toHaveValue("41");
    await page.keyboard.press(`${modifier}+y`);
    await expect(width).toHaveValue("42");
    for (const key of ["Space", "Enter", "Delete", "Backspace", "Escape"]) {
      await page.keyboard.press(key);
      await expect(handle).toBeFocused();
      await expect(width).toHaveValue("42");
      await expect(app.canvas).toHaveAttribute(
        "data-selected-object-id",
        app.main.id,
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await expect(
      page.getByRole("status", { name: "Trạng thái dự án" }),
    ).toHaveText("Đã lưu");
    const saved = await app.head();
    expect(
      saved.project.scenes[0].objects.find(
        (object: { id: string }) => object.id === app.main.id,
      ).components[0].properties.width,
    ).toBe(42);
    await page.reload();
    await expect(
      page.getByRole("spinbutton", { name: "width", exact: true }),
    ).toHaveValue("42");
  });
}

for (const key of ["Delete", "Backspace"]) {
  test(`native tree-focused ${key} opens confirmation after mouse selection`, async ({
    page,
  }) => {
    const app = await setup(page);
    const point = await client(app.canvas, 50, 50);
    await page.mouse.click(point.x, point.y);
    await expect(
      page.getByRole("treeitem", { name: "Editable panel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press(key);
    const dialog = page.getByRole("dialog", { name: /Xóa “Editable panel”/ });
    await expect(dialog).toBeVisible();
    expect((await app.head()).project).toEqual(app.baseline.project);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(app.canvas).toHaveAttribute(
      "data-selected-object-id",
      app.main.id,
    );
  });
}

test("native tree-focused Escape clears mouse selection without refocusing canvas", async ({
  page,
}) => {
  const app = await setup(page);
  const point = await client(app.canvas, 50, 50);
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole("treeitem", { name: "Editable panel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(app.canvas).not.toHaveAttribute("data-selected-object-id");
  expect((await app.head()).project).toEqual(app.baseline.project);
});

test("native tree-focused Space pans without a revision, browser scroll or hierarchy focus handoff", async ({
  page,
}) => {
  const app = await setup(page);
  const point = await client(app.canvas, 50, 50);
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole("treeitem", { name: "Editable panel", exact: true }),
  ).toBeFocused();
  const before = await app.canvas.getAttribute("data-camera-x");
  const scroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.down("Space");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 40, point.y + 25, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(app.canvas).toBeFocused();
  await expect(app.canvas).not.toHaveAttribute("data-camera-x", before!);
  expect(app.requests).toHaveLength(0);
  expect((await app.head()).project).toEqual(app.baseline.project);
});

test("native multiline component strings edit, undo and reload exact canonical newlines", async ({
  page,
}) => {
  const app = await setup(page),
    original = "First line\nSecond line\n",
    edited = "Edited first\nEdited second\n";
  const gameId = page.url().split("/").at(-1)!,
    head = await app.head();
  const response = await page.request.post(
    `/api/games/${gameId}/engine-project/mutations`,
    {
      data: {
        baseRevision: head.revision.revisionNumber,
        mutationId: randomUUID(),
        mutations: ["InventoryItem", "Text"].map((type) => ({
          type: "component.add",
          sceneId: head.project.scenes[0].id,
          objectId: app.main.id,
          component: {
            id: randomUUID(),
            type,
            version: 1,
            properties: {
              ...(v2ComponentRegistry[
                type as "InventoryItem" | "Text"
              ].defaults() as object),
              [type === "Text" ? "text" : "description"]: original,
            },
          },
          beforeComponentId: null,
        })),
      },
    },
  );
  expect(response.status(), await response.text()).toBe(201);
  await page.reload();
  await page
    .getByRole("treeitem", { name: "Editable panel", exact: true })
    .click();
  for (const [type, field] of [
    ["InventoryItem", "description"],
    ["Text", "text"],
  ]) {
    const component = page.getByRole("group", { name: type, exact: true });
    const textbox = component.getByRole("textbox", {
      name: field,
      exact: true,
    });
    await expect(textbox).toHaveValue(original);
    await textbox.fill(edited);
    const save = component.getByRole("button", {
      name: `Lưu ${type}`,
      exact: true,
    });
    await save.click();
    await expect(save).toBeFocused();
    await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
    await expect(textbox).toHaveValue(original);
    await page.getByRole("button", { name: "Làm lại", exact: true }).click();
    await expect(textbox).toHaveValue(edited);
  }
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const saved = (await app.head()).project;
  const components = saved.scenes[0].objects.find(
    (object: { id: string }) => object.id === app.main.id,
  ).components;
  expect(
    components.find((component: { type: string }) => component.type === "Text")
      .properties.text,
  ).toBe(edited);
  expect(
    components.find(
      (component: { type: string }) => component.type === "InventoryItem",
    ).properties.description,
  ).toBe(edited);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "text", exact: true }),
  ).toHaveValue(edited);
  await expect(
    page.getByRole("textbox", { name: "description", exact: true }),
  ).toHaveValue(edited);
  expect((await app.head()).project).toEqual(saved);
});

test("hierarchy and inspector edit the official canonical project, retain selection and reload exact saved edits", async ({
  page,
}) => {
  const { canvas, main, locked, head } = await setup(page);
  const start = await client(canvas, 50, 50);
  await page.mouse.click(start.x, start.y);
  const selected = page.getByRole("treeitem", {
    name: "Editable panel",
    exact: true,
  });
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(selected).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Tên đối tượng" }),
  ).toHaveValue("Editable panel");
  const lockedRow = page.getByRole("treeitem", {
    name: "Locked panel",
    exact: true,
  });
  await lockedRow.click();
  await expect(canvas).toHaveAttribute("data-selected-object-id", locked.id);
  await lockedRow.press("Enter");
  await expect(canvas).toBeFocused();
  await selected.click();
  await page
    .getByRole("textbox", { name: "Tên đối tượng" })
    .fill("Inspected panel");
  await page
    .getByRole("button", { name: "Lưu đối tượng", exact: true })
    .click();
  const transform = page.getByRole("group", { name: "Transform", exact: true });
  await transform
    .getByRole("spinbutton", { name: "rotation", exact: true })
    .fill("30");
  await transform
    .getByRole("button", { name: "Lưu Transform", exact: true })
    .click();
  await expect(
    transform.getByRole("button", { name: "Lưu Transform", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(
    transform.getByRole("spinbutton", { name: "rotation", exact: true }),
  ).toHaveValue("0");
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(
    transform.getByRole("spinbutton", { name: "rotation", exact: true }),
  ).toHaveValue("30");
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const saved = (await head()).project;
  const edited = saved.scenes[0].objects.find(
    (object: { id: string }) => object.id === main.id,
  );
  expect(edited.name).toBe("Inspected panel");
  expect(edited.components[0].properties.rotation).toBe(30);
  await page.reload();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await expect(
    page.getByRole("treeitem", { name: "Inspected panel", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(canvas).toHaveAttribute("data-selected-object-id", main.id);
  await expect(
    page.getByRole("textbox", { name: "Tên đối tượng" }),
  ).toHaveValue("Inspected panel");
  expect((await head()).project).toEqual(saved);
  await page.screenshot({
    path: "../../.superpowers/sdd/2026-09-09-unified-game-studio/task-17-official.png",
    fullPage: true,
  });
});
async function pixel(canvas: Locator, x: number, y: number) {
  const point = await client(canvas, x, y);
  return canvas.evaluate((element, point) => {
    const canvas = element as HTMLCanvasElement,
      rect = canvas.getBoundingClientRect();
    return [
      ...canvas
        .getContext("2d")!
        .getImageData(
          Math.floor(((point.x - rect.left) * canvas.width) / rect.width),
          Math.floor(((point.y - rect.top) * canvas.height) / rect.height),
          1,
          1,
        ).data,
    ];
  }, point);
}
async function drag(
  page: Page,
  canvas: Locator,
  from: [number, number],
  to: [number, number],
  drop = true,
) {
  const start = await client(canvas, ...from),
    end = await client(canvas, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 });
  if (drop) await page.mouse.up();
}

test("native drag previews persist zero revisions until drop, then one exact Transform revision survives reload and parent movement remains local", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = await setup(page, `Editable panel ${"W".repeat(65)}`);
  const beforeSelection = await app.canvas.boundingBox();
  await drag(page, app.canvas, [50, 50], [82, 66], false);
  expect(await app.canvas.boundingBox()).toEqual(beforeSelection);
  await expect(app.canvas).toHaveAttribute(
    "data-selected-object-id",
    app.main.id,
  );
  await expect.poll(() => pixel(app.canvas, 100, 60)).toEqual([0, 255, 0, 255]);
  // Keep the actual mouse down across more than the production 500ms debounce.
  await page.waitForTimeout(800);
  expect(app.requests).toHaveLength(0);
  expect(await app.head()).toEqual(app.baseline);
  await page.mouse.up();
  await expect.poll(() => app.requests.length).toBe(1);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  expect(app.requests[0].mutations).toHaveLength(1);
  expect(app.requests[0].mutations[0]).toMatchObject({
    type: "component.update",
    objectId: app.main.id,
    properties: {
      width: 40,
      height: 30,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      pivot: { x: 0.5, y: 0.5 },
    },
  });
  expect(app.requests[0].mutations[0].properties.x).toBeCloseTo(72);
  expect(app.requests[0].mutations[0].properties.y).toBeCloseTo(56);
  const saved = await app.head();
  expect(saved.revision.revisionNumber).toBe(
    app.baseline.revision.revisionNumber + 1,
  );
  await page.reload();
  expect(await app.head()).toEqual(saved);
  await expect.poll(() => pixel(app.canvas, 100, 60)).toEqual([0, 255, 0, 255]);
  await drag(page, app.canvas, [225, 150], [257, 166]);
  await expect.poll(() => app.requests.length).toBe(2);
  const changed = app.requests[1].mutations[0];
  expect(changed.objectId).toBe(app.child.id);
  expect(changed.properties.x).toBeCloseTo(18);
  expect(changed.properties.y).toBeCloseTo(52);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const childSaved = await app.head();
  await page.reload();
  expect(await app.head()).toEqual(childSaved);
  await expect(app.canvas).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("canvas-gestures.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("native resize, snap and confirmed delete each use canonical undo and redo", async ({
  page,
}) => {
  const app = await setup(page);
  const selected = await client(app.canvas, 50, 50);
  await page.mouse.click(selected.x, selected.y);
  const handle = page.getByRole("button", { name: "Đổi kích thước" });
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const end = await client(app.canvas, 100, 80);
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => app.requests.length).toBe(1);
  expect(app.requests[0].mutations[0].properties.width).toBeCloseTo(60);
  expect(app.requests[0].mutations[0].properties.height).toBeCloseTo(40);
  const resized = structuredClone(app.requests[0].mutations[0].properties);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await page.getByRole("button", { name: "Bám lưới" }).click();
  await expect.poll(() => app.requests.length).toBe(2);
  expect(app.requests[1].mutations).toMatchObject([
    { type: "scene.update", changes: { settings: { grid: { snap: true } } } },
  ]);
  await expect(page.getByRole("checkbox", { name: "Bám lưới" })).toBeChecked();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await drag(page, app.canvas, [50, 50], [75, 90]);
  await expect.poll(() => app.requests.length).toBe(3);
  expect(app.requests[2].mutations[0].properties).toMatchObject({
    x: 64,
    y: 96,
  });
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await app.canvas.press("Control+z");
  await expect.poll(() => app.requests.length).toBe(4);
  expect(app.requests[3].mutations[0].properties).toEqual(resized);
  await app.canvas.press("Control+Shift+z");
  await expect.poll(() => app.requests.length).toBe(5);
  await app.canvas.press("Delete");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(app.requests).toHaveLength(5);
  await page.getByRole("button", { name: "Hủy" }).click();
  await app.canvas.press("Backspace");
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect.poll(() => app.requests.length).toBe(6);
  expect(app.requests[5].mutations).toMatchObject([
    { type: "object.delete", objectIds: [app.main.id], confirmed: true },
  ]);
  await app.canvas.press("Meta+z");
  await expect.poll(() => app.requests.length).toBe(7);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const restored = await app.head();
  expect(
    restored.project.scenes[0].objects.find(
      (object: { id: string }) => object.id === app.main.id,
    ).components[0].properties,
  ).toEqual({ ...resized, x: 64, y: 96 });
  await page.reload();
  expect(await app.head()).toEqual(restored);
  await expect(page.getByRole("button", { name: "Bám lưới" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("native locked picking, pointer capture cancellation, Space pan, wheel and reset do not save", async ({
  page,
}) => {
  const app = await setup(page);
  for (const position of [
    [130, 50],
    [180, 50],
    [230, 50],
  ] as const) {
    const p = await client(app.canvas, position[0], position[1]);
    await page.mouse.click(p.x, p.y);
    await expect(app.canvas).not.toHaveAttribute("data-selected-object-id");
  }
  await drag(page, app.canvas, [50, 50], [80, 90], false);
  expect(
    await app.canvas.evaluate((element) =>
      (element as HTMLCanvasElement).hasPointerCapture(1),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  expect(
    await app.canvas.evaluate((element) =>
      (element as HTMLCanvasElement).hasPointerCapture(1),
    ),
  ).toBe(false);
  await page.mouse.up();
  await expect.poll(() => pixel(app.canvas, 45, 45)).toEqual([0, 255, 0, 255]);
  await drag(page, app.canvas, [50, 50], [80, 90], false);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(
    await app.canvas.evaluate((element) =>
      (element as HTMLCanvasElement).hasPointerCapture(1),
    ),
  ).toBe(false);
  await page.mouse.up();
  await drag(page, app.canvas, [50, 50], [80, 90], false);
  await app.canvas.evaluate((element) =>
    (element as HTMLCanvasElement).releasePointerCapture(1),
  );
  await page.mouse.up();
  const before = await app.canvas.getAttribute("data-camera-x");
  await app.canvas.focus();
  await page.keyboard.down("Space");
  await drag(page, app.canvas, [100, 150], [120, 160]);
  await page.keyboard.up("Space");
  expect(await app.canvas.getAttribute("data-camera-x")).not.toBe(before);
  const point = await client(app.canvas, 100, 100);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -200);
  await page.getByRole("button", { name: "Vừa Scene" }).click();
  expect(await app.canvas.getAttribute("data-camera-x")).toBe(before);
  await page.waitForTimeout(800);
  expect(app.requests).toHaveLength(0);
  expect(await app.head()).toEqual(app.baseline);
});
