import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  EngineProjectV2,
  compileEngineHtml,
  createPixelAdventure,
} from "@indieforge/contracts";

const redPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWMQ2RLwHx9mGBkKALBkhcGjUWVdAAAAAElFTkSuQmCC";

function id(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function proofProject(source: string) {
  let next = 1;
  const project = createPixelAdventure(id(0), () => id(next++));
  const scene = project.scenes[0];
  const hero = scene.objects.find((object) => object.objectType === "PLAYER")!;
  const heroSprite = hero.components.find(
    (component) => component.type === "SpriteRenderer",
  )!;
  const importedAsset = id(900);
  project.assetIds.push(importedAsset);
  heroSprite.properties = {
    ...heroSprite.properties,
    assetId: importedAsset,
    frame: null,
  };

  const tree = scene.objects.find((object) => object.name === "Cây chắn lối")!;
  Object.assign(
    tree.components.find((component) => component.type === "Transform")!
      .properties,
    { x: 80, y: 336 },
  );

  const objectBase = scene.objects.length + 1;
  const coin = {
    id: id(901),
    name: "Proof coin",
    objectType: "ITEM" as const,
    parentId: null,
    layerId: hero.layerId,
    enabled: true,
    visible: true,
    locked: false,
    order: objectBase,
    renderOrder: objectBase,
    components: [
      {
        id: id(902),
        version: 1 as const,
        type: "Transform" as const,
        properties: {
          x: 104,
          y: 304,
          width: 24,
          height: 24,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivot: { x: 0.5, y: 0.5 },
        },
      },
      {
        id: id(903),
        version: 1 as const,
        type: "SpriteRenderer" as const,
        properties: {
          frame: "tfg:crystal",
          assetId: null,
          opacity: 1,
          flipX: false,
          flipY: false,
          visible: true,
        },
      },
      {
        id: id(904),
        version: 1 as const,
        type: "Collider" as const,
        properties: {
          shape: "RECTANGLE",
          width: 24,
          height: 24,
          offsetX: 0,
          offsetY: 0,
          isTrigger: true,
          collisionLayerId: null,
        },
      },
      {
        id: id(905),
        version: 1 as const,
        type: "InventoryItem" as const,
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
    ],
  };
  const gate = {
    id: id(906),
    name: "Proof exit",
    objectType: "TRIGGER" as const,
    parentId: null,
    layerId: hero.layerId,
    enabled: true,
    visible: true,
    locked: false,
    order: objectBase + 1,
    renderOrder: objectBase + 1,
    components: [
      {
        id: id(907),
        version: 1 as const,
        type: "Transform" as const,
        properties: {
          x: 160,
          y: 304,
          width: 24,
          height: 24,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivot: { x: 0.5, y: 0.5 },
        },
      },
      {
        id: id(908),
        version: 1 as const,
        type: "SpriteRenderer" as const,
        properties: {
          frame: "tfg:gate",
          assetId: null,
          opacity: 1,
          flipX: false,
          flipY: false,
          visible: true,
        },
      },
      {
        id: id(909),
        version: 1 as const,
        type: "Collider" as const,
        properties: {
          shape: "RECTANGLE",
          width: 24,
          height: 24,
          offsetX: 0,
          offsetY: 0,
          isTrigger: true,
          collisionLayerId: null,
        },
      },
    ],
  };
  const thorns = {
    id: id(910),
    name: "Proof thorns",
    objectType: "DECORATION" as const,
    parentId: null,
    layerId: hero.layerId,
    enabled: true,
    visible: true,
    locked: false,
    order: objectBase + 2,
    renderOrder: objectBase + 2,
    components: [
      {
        id: id(911),
        version: 1 as const,
        type: "Transform" as const,
        properties: {
          x: 48,
          y: 368,
          width: 24,
          height: 16,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivot: { x: 0.5, y: 0.5 },
        },
      },
      {
        id: id(912),
        version: 1 as const,
        type: "SpriteRenderer" as const,
        properties: {
          frame: "tfg:hazard",
          assetId: null,
          opacity: 1,
          flipX: false,
          flipY: false,
          visible: true,
        },
      },
      {
        id: id(913),
        version: 1 as const,
        type: "Collider" as const,
        properties: {
          shape: "RECTANGLE",
          width: 24,
          height: 16,
          offsetX: 0,
          offsetY: 0,
          isTrigger: true,
          collisionLayerId: null,
        },
      },
    ],
  };
  scene.objects.push(coin, gate, thorns);
  const health = hero.components.find((component) => component.type === "Health")!;
  project.events.push(
    {
      id: id(914),
      version: 1,
      name: "Proof score",
      enabled: true,
      order: project.events.length,
      trigger: {
        type: "ON_COLLECT_ITEM",
        itemObjectId: coin.id,
        collectorObjectId: hero.id,
      },
      condition: null,
      steps: [{ id: id(915), version: 1, type: "ADD_SCORE", amount: 7 }],
    },
    {
      id: id(916),
      version: 1,
      name: "Proof win",
      enabled: true,
      order: project.events.length + 1,
      trigger: {
        type: "ON_ENTER_AREA",
        areaObjectId: gate.id,
        enteringObjectId: hero.id,
      },
      condition: {
        id: id(917),
        version: 1,
        type: "SCORE_COMPARE",
        operator: "GREATER_THAN_OR_EQUAL",
        value: 7,
      },
      steps: [{ id: id(918), version: 1, type: "COMPLETE_GAME" }],
    },
    {
      id: id(919),
      version: 1,
      name: "Proof damage",
      enabled: true,
      order: project.events.length + 2,
      trigger: {
        type: "ON_COLLISION",
        firstObjectId: hero.id,
        secondObjectId: thorns.id,
      },
      condition: null,
      steps: [
        {
          id: id(920),
          version: 1,
          type: "CHANGE_HEALTH",
          objectId: hero.id,
          componentId: health.id,
          amount: -1,
        },
      ],
    },
  );
  project.scripts[0] = {
    ...project.scripts[0],
    source,
    capabilities: ["SHOW_DIALOGUE"],
  };
  return EngineProjectV2.parse(project);
}

async function loadGame(page: Page, source: string) {
  await page.setContent(
    compileEngineHtml(proofProject(source), { [id(900)]: redPng }),
  );
  await page.getByRole("img", { name: "Màn hình trò chơi" }).focus();
}

async function holdKey(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function holdButton(page: Page, button: Locator, ms: number) {
  const box = await button.boundingBox();
  if (!box) throw new Error("Directional control is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function canvasPixel(page: Page, x: number, y: number) {
  return await page
    .getByRole("img", { name: "Màn hình trò chơi" })
    .evaluate(
      (canvas, point) =>
        Array.from(
          (canvas as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(point.x, point.y, 1, 1).data,
        ),
      { x, y },
    );
}

test("compiled pixel adventure proves imported art, rules, input, scripts and restart", async ({
  page,
}) => {
  await loadGame(
    page,
    'api.showDialogue("Script persisted into the playable build.");',
  );
  await expect(
    page.getByRole("button", { name: "Đóng hội thoại" }),
  ).toHaveText("Script persisted into the playable build.");

  await expect
    .poll(() => canvasPixel(page, 56, 344), { message: "imported sprite drew" })
    .not.toEqual([23, 62, 84, 255]);

  await holdKey(page, "ArrowRight", 450);
  await expect
    .poll(() => canvasPixel(page, 90, 344), {
      message: "wall blocks keyboard movement",
    })
    .toEqual([23, 62, 84, 255]);
  await expect(page.getByText(/Điểm 0/)).toBeVisible();

  await holdKey(page, "ArrowUp", 270);
  await holdKey(page, "ArrowRight", 760);
  await expect(page.getByText(/Điểm 7/)).toBeVisible();
  await holdKey(page, "ArrowRight", 360);
  await expect(page.getByRole("status")).toContainText("Hoàn thành");

  await page.getByRole("button", { name: "Chơi lại" }).click();
  await expect(page.getByText(/Điểm 0/)).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();

  const down = page.getByRole("button", { name: "Xuống" });
  const up = page.getByRole("button", { name: "Lên" });
  for (let i = 2; i >= 0; i--) {
    await holdButton(page, down, 260);
    await expect(page.getByText(new RegExp(`♥ ${i}/3`))).toBeVisible();
    if (i > 0) await holdButton(page, up, 260);
  }
  await expect(page.getByRole("status")).toContainText("Hết sức");

  await loadGame(page, 'throw new Error("bad proof script");');
  await expect(page.getByRole("button", { name: "Đóng hội thoại" })).toBeHidden();
  await expect(page.getByText(/bad proof script/)).toBeVisible();
});
