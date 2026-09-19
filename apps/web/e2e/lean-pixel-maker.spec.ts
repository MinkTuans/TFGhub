import { randomUUID } from "node:crypto";
import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { EngineProjectV2, type EngineProjectV2Type } from "@indieforge/contracts";

test.skip(
  process.env.E2E_EXTERNAL_SERVICES !== "1" ||
    process.env.E2E_LEAN_PIXEL_MAKER !== "1",
  "Lean Pixel Maker requires an explicitly opted-in disposable PostgreSQL/API/storage stack",
);
test.use({ hasTouch: true, viewport: { width: 820, height: 900 } });

const apiBase = (process.env.E2E_API_URL ?? "/api").replace(/\/$/, "");
const api = (path: string) => `${apiBase}${path}`;
const magentaPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z/D/PwAG/gL+DHWJ3gAAAABJRU5ErkJggg==",
  "base64",
);
type ReadResponse = {
  status: "SUPPORTED";
  project: EngineProjectV2Type;
  revision: { revisionNumber: number };
};
type Scene = EngineProjectV2Type["scenes"][number];
type GameObject = Scene["objects"][number];
type Component = GameObject["components"][number];

function id() {
  return randomUUID();
}

function transform(id: string, x: number, y: number, width: number, height: number): Component {
  return {
    id,
    version: 1,
    type: "Transform",
    properties: {
      x,
      y,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      pivot: { x: 0.5, y: 0.5 },
    },
  };
}

function sprite(id: string, frame: string): Component {
  return {
    id,
    version: 1,
    type: "SpriteRenderer",
    properties: {
      frame,
      assetId: null,
      opacity: 1,
      flipX: false,
      flipY: false,
      visible: true,
    },
  };
}

function collider(id: string, width: number, height: number, isTrigger: boolean): Component {
  return {
    id,
    version: 1,
    type: "Collider",
    properties: {
      shape: "RECTANGLE",
      width,
      height,
      offsetX: 0,
      offsetY: 0,
      isTrigger,
      collisionLayerId: null,
    },
  };
}

function object(
  scene: Scene,
  layerId: string,
  name: string,
  objectType: GameObject["objectType"],
  components: Component[],
): GameObject {
  return {
    id: id(),
    name,
    objectType,
    parentId: null,
    layerId,
    enabled: true,
    visible: true,
    locked: false,
    order: scene.objects.length,
    renderOrder: scene.objects.length + 1,
    components,
  };
}

async function readProject(page: Page, gameId: string): Promise<ReadResponse> {
  const response = await page.request.get(api(`/games/${gameId}/engine-project`));
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as ReadResponse;
  expect(body.status).toBe("SUPPORTED");
  body.project = EngineProjectV2.parse(body.project);
  return body;
}

async function mutateProject(
  page: Page,
  gameId: string,
  baseRevision: number,
  mutations: unknown[],
) {
  const response = await page.request.post(api(`/games/${gameId}/engine-project/mutations`), {
    data: {
      baseRevision,
      mutationId: id(),
      mutations,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function createProject(page: Page) {
  const suffix = randomUUID();
  const registered = await page.request.post(api("/auth/register"), {
    data: {
      email: `lean-pixel-${suffix}@example.test`,
      password: "Studio-password123!",
    },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  await page.goto("/studio/games/new");
  await page.getByRole("button", { name: "Tạo game Pixel" }).click();
  await expect(page.getByRole("radio", { name: /Khuyên dùng/ })).toBeChecked();
  await page.getByLabel("Tên trò chơi").fill(`Proof ${suffix}`);
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page.getByRole("main", { name: "Xưởng sáng tạo trò chơi" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Trạng thái dự án" })).toHaveText("Đã lưu");
  return page.url().split("/").at(-1)!;
}

async function uploadHeroAsset(page: Page, gameId: string) {
  const manager = page.getByRole("region", { name: "Tài nguyên" });
  await page.getByRole("button", { name: "Tài nguyên" }).click();
  await manager.getByRole("button", { name: "Nhân vật", exact: true }).click();
  await manager.getByLabel("Tải tài nguyên lên").setInputFiles({
    name: "proof-hero.png",
    mimeType: "image/png",
    buffer: magentaPng,
  });
  const card = manager.getByRole("group", { name: "Tài nguyên proof-hero.png" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("img", { name: "Xem trước proof-hero.png" })).toHaveJSProperty("naturalWidth", 1);
  await expect
    .poll(async () => {
      const response = await page.request.get(api(`/games/${gameId}/assets?state=READY&search=proof-hero`));
      if (!response.ok()) return null;
      const body = await response.json();
      return body.items?.[0]?.id ?? null;
    })
    .toBeTruthy();
  const listed = await (await page.request.get(api(`/games/${gameId}/assets?state=READY&search=proof-hero`))).json();
  return String(listed.items[0].id);
}

async function authorProofScene(page: Page, gameId: string, assetId: string) {
  const read = await readProject(page, gameId);
  const project = read.project;
  const scene = project.scenes[0];
  const player = scene.objects.find((candidate) => candidate.objectType === "PLAYER")!;
  const playerSprite = player.components.find((component) => component.type === "SpriteRenderer")!;
  const tree = scene.objects.find((candidate) => candidate.name === "Cây chắn lối")!;
  const treeTransform = tree.components.find((component) => component.type === "Transform")!;
  const health = player.components.find((component) => component.type === "Health")!;
  const coin = object(scene, player.layerId, "Proof coin", "ITEM", [
    transform(id(), 104, 304, 24, 24),
    sprite(id(), "tfg:crystal"),
    collider(id(), 24, 24, true),
    {
      id: id(),
      version: 1,
      type: "InventoryItem",
      properties: {
        itemKey: "proof_coin",
        displayName: "Proof coin",
        description: "",
        iconAssetId: null,
        collectible: true,
        quantityMode: "SINGLE",
        maximumQuantity: 1,
        appearanceConditionId: null,
        triggerEventId: null,
      },
    },
  ]);
  const gate = object(scene, player.layerId, "Proof exit", "TRIGGER", [
    transform(id(), 160, 304, 24, 24),
    sprite(id(), "tfg:gate"),
    collider(id(), 24, 24, true),
  ]);
  const thorns = object(scene, player.layerId, "Proof thorns", "DECORATION", [
    transform(id(), 48, 368, 24, 16),
    sprite(id(), "tfg:hazard"),
    collider(id(), 24, 16, true),
  ]);
  await mutateProject(page, gameId, read.revision.revisionNumber, [
    { type: "asset.declare", assetId },
    {
      type: "component.update",
      sceneId: scene.id,
      objectId: player.id,
      componentId: playerSprite.id,
      properties: { ...playerSprite.properties, assetId, frame: null },
    },
    {
      type: "component.update",
      sceneId: scene.id,
      objectId: tree.id,
      componentId: treeTransform.id,
      properties: { ...treeTransform.properties, x: 80, y: 336 },
    },
    { type: "object.create", sceneId: scene.id, objects: [{ object: coin, beforeObjectId: null }] },
    { type: "object.create", sceneId: scene.id, objects: [{ object: gate, beforeObjectId: null }] },
    { type: "object.create", sceneId: scene.id, objects: [{ object: thorns, beforeObjectId: null }] },
    {
      type: "event.upsert",
      event: {
        id: id(),
        version: 1,
        name: "Proof score",
        enabled: true,
        order: project.events.length,
        trigger: { type: "ON_COLLECT_ITEM", itemObjectId: coin.id, collectorObjectId: player.id },
        condition: null,
        steps: [{ id: id(), version: 1, type: "ADD_SCORE", amount: 7 }],
      },
    },
    {
      type: "event.upsert",
      event: {
        id: id(),
        version: 1,
        name: "Proof win",
        enabled: true,
        order: project.events.length + 1,
        trigger: { type: "ON_ENTER_AREA", areaObjectId: gate.id, enteringObjectId: player.id },
        condition: { id: id(), version: 1, type: "SCORE_COMPARE", operator: "GREATER_THAN_OR_EQUAL", value: 7 },
        steps: [{ id: id(), version: 1, type: "COMPLETE_GAME" }],
      },
    },
    {
      type: "event.upsert",
      event: {
        id: id(),
        version: 1,
        name: "Proof damage",
        enabled: true,
        order: project.events.length + 2,
        trigger: { type: "ON_COLLISION", firstObjectId: player.id, secondObjectId: thorns.id },
        condition: null,
        steps: [{ id: id(), version: 1, type: "CHANGE_HEALTH", objectId: player.id, componentId: health.id, amount: -1 }],
      },
    },
  ]);
}

async function saveScript(page: Page, source: string) {
  await page.getByRole("button", { name: "Code" }).click();
  const script = page.getByRole("navigation", { name: "Danh sách script" }).getByRole("button").first();
  await script.click();
  await page.getByRole("textbox", { name: "Tên script" }).fill("Proof scene script");
  await page.getByRole("textbox", { name: "Mã JavaScript" }).fill(source);
  await page.getByRole("checkbox", { name: "Hiện hội thoại" }).check();
  await page.getByRole("button", { name: "Lưu script vào dự án" }).click();
  await expect(page.getByRole("status", { name: "Trạng thái dự án" })).toHaveText("Đã lưu");
}

async function buildPreview(page: Page) {
  await page.getByRole("button", { name: "Chơi thử & xuất bản" }).click();
  await page.getByRole("button", { name: "Tạo bản chơi thử" }).click();
  const frame = page.frameLocator('iframe[title="Chơi thử trò chơi"]');
  await expect(frame.getByRole("img", { name: "Màn hình trò chơi" })).toBeVisible();
  return frame;
}

async function canvasPixel(frame: FrameLocator, x: number, y: number) {
  return await frame.getByRole("img", { name: "Màn hình trò chơi" }).evaluate((canvas, point) =>
    Array.from((canvas as HTMLCanvasElement).getContext("2d")!.getImageData(point.x, point.y, 1, 1).data),
  { x, y });
}

async function holdKey(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function holdPointer(page: Page, target: Locator, ms: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Directional control is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test("Studio authors, persists, builds and plays the edited Pixel Adventure", async ({ page }) => {
  const gameId = await createProject(page);
  const assetId = await uploadHeroAsset(page, gameId);
  await authorProofScene(page, gameId, assetId);

  await page.reload();
  await expect(page.getByRole("status", { name: "Trạng thái dự án" })).toHaveText("Đã lưu");
  const persisted = await readProject(page, gameId);
  expect(persisted.project.assetIds).toContain(assetId);
  expect(persisted.project.events.some((event) => event.name === "Proof score")).toBe(true);
  expect(
    persisted.project.scenes[0].objects.some((candidate) => candidate.name === "Proof coin"),
  ).toBe(true);

  const validDialogue = "Script persisted into the playable build.";
  await saveScript(page, `api.showDialogue("${validDialogue}");`);
  await page.reload();
  await page.getByRole("button", { name: "Code" }).click();
  await page.getByRole("button", { name: "Proof scene script" }).click();
  await expect(page.getByRole("textbox", { name: "Mã JavaScript" })).toHaveValue(`api.showDialogue("${validDialogue}");`);
  await expect(page.getByRole("button", { name: "Đóng hội thoại" })).toHaveCount(0);

  const frame = await buildPreview(page);
  await expect(frame.getByRole("button", { name: "Đóng hội thoại" })).toHaveText(validDialogue);
  await frame.getByRole("button", { name: "Đóng hội thoại" }).click();
  await expect.poll(() => canvasPixel(frame, 56, 344)).toEqual([255, 0, 255, 255]);
  await frame.getByRole("img", { name: "Màn hình trò chơi" }).click();
  await holdKey(page, "ArrowRight", 450);
  await expect.poll(() => canvasPixel(frame, 56, 344)).toEqual([255, 0, 255, 255]);
  await expect(frame.getByText(/Điểm 0/)).toBeVisible();
  await holdKey(page, "ArrowUp", 270);
  await holdKey(page, "ArrowRight", 760);
  await expect(frame.getByText(/Điểm 7/)).toBeVisible();
  await holdKey(page, "ArrowRight", 360);
  await expect(frame.getByRole("status")).toContainText("Hoàn thành");
  await frame.getByRole("button", { name: "Chơi lại" }).click();
  await expect(frame.getByText(/Điểm 0/)).toBeVisible();
  const down = frame.getByRole("button", { name: "Xuống" });
  const up = frame.getByRole("button", { name: "Lên" });
  for (let health = 2; health >= 0; health -= 1) {
    await holdPointer(page, down, 260);
    await expect(frame.getByText(new RegExp(`♥ ${health}/3`))).toBeVisible();
    if (health > 0) await holdPointer(page, up, 260);
  }
  await expect(frame.getByRole("status")).toContainText("Hết sức");

  await saveScript(page, 'throw new Error("bad proof script");');
  await expect(page.getByTitle("Chơi thử trò chơi")).toHaveCount(0);
  const invalidFrame = await buildPreview(page);
  await expect(invalidFrame.getByRole("button", { name: "Đóng hội thoại" })).toBeHidden();
  await invalidFrame.getByText("Chẩn đoán runtime").click();
  await expect(invalidFrame.getByText(/bad proof script/)).toBeVisible();
});
