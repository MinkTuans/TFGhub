import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const apiBase = (process.env.E2E_API_URL ?? "/api").replace(/\/$/, "");
const api = (path: string) => `${apiBase}${path}`;

test.skip(
  process.env.E2E_EXTERNAL_SERVICES !== "1" ||
    process.env.E2E_STUDIO_ASSETS !== "1",
  "Studio assets require an explicitly opted-in disposable PostgreSQL/API/storage stack",
);

async function createProject(page: Page) {
  const suffix = randomUUID();
  await page.request.post(api("/auth/register"), {
    data: {
      email: `studio-assets-${suffix}@example.test`,
      password: "Studio-password123!",
    },
  });
  await page.goto("/studio/games/new");
  await page.getByRole("button", { name: "Tạo game Pixel" }).click();
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page.getByRole("main", { name: "Xưởng sáng tạo trò chơi" })).toBeVisible();
  return page.url().split("/").at(-1)!;
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWMQ2RLwHx9mGBkKALBkhcGjUWVdAAAAAElFTkSuQmCC",
  "base64",
);

test("upload, rename, drag, autosave and reload keep only the stable asset reference", async ({
  page,
}) => {
  const gameId = await createProject(page);
  const manager = page.getByRole("region", { name: "Tài nguyên" });
  await expect(manager).toBeVisible();
  await manager.getByRole("button", { name: "Vật phẩm" }).click();
  await manager.getByLabel("Tải tài nguyên lên").setInputFiles({
    name: "potion.png",
    mimeType: "image/png",
    buffer: png,
  });
  const card = manager.getByRole("group", { name: "Tài nguyên potion.png" });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("img", { name: "Xem trước potion.png" }),
  ).toHaveAttribute("loading", "lazy");
  await expect(
    card.getByRole("img", { name: "Xem trước potion.png" }),
  ).toHaveJSProperty("naturalWidth", 8);
  await card.getByRole("button", { name: "Đổi tên" }).click();
  await card.getByRole("textbox", { name: "Tên tài nguyên" }).fill("Potion");
  await card.getByRole("button", { name: "Lưu tên" }).click();
  await expect(manager.getByText("Potion", { exact: true })).toBeVisible();

  await manager
    .getByRole("group", { name: "Tài nguyên Potion" })
    .dragTo(page.locator("canvas"), {
      targetPosition: { x: 180, y: 160 },
    });
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const saved = await (
    await page.request.get(api(`/games/${gameId}/engine-project`))
  ).json();
  expect(saved.project.assetIds).toHaveLength(1);
  const object = saved.project.scenes[0].objects[0];
  const item = object.components.find(
    (component: { type: string }) => component.type === "InventoryItem",
  );
  expect(item.properties.iconAssetId).toBe(saved.project.assetIds[0]);
  expect(JSON.stringify(object)).not.toMatch(
    /contentUrl|thumbnailUrl|contentHash|mimeType/,
  );

  await page.reload();
  await expect(
    manager.getByRole("group", { name: "Tài nguyên Potion" }),
  ).toContainText("Đang dùng trong dự án");
  await manager
    .getByRole("group", { name: "Tài nguyên Potion" })
    .getByRole("button", { name: "Xóa tài nguyên" })
    .click();
  const warning = page.getByRole("dialog", { name: "Xóa Potion?" });
  await expect(warning).toContainText("đang được dùng trong dự án hiện tại");
  await expect(
    warning.getByRole("button", { name: "Xác nhận xóa" }),
  ).toBeDisabled();
  await warning.getByRole("button", { name: "Hủy" }).click();

  await page.getByRole("button", { name: "Thêm lớp", exact: true }).click();
  const layerEditor = page.getByRole("group", { name: "Lớp mới", exact: true });
  await layerEditor
    .getByRole("combobox", { name: "Loại lớp" })
    .selectOption("UI");
  await layerEditor.getByRole("button", { name: "Lưu lớp" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await manager.getByRole("button", { name: "Giao diện", exact: true }).click();
  await manager.getByLabel("Tải tài nguyên lên").setInputFiles({
    name: "panel.png",
    mimeType: "image/png",
    buffer: png,
  });
  const panel = manager.getByRole("group", { name: "Tài nguyên panel.png" });
  await expect(panel).toBeVisible();
  await page.locator("canvas").focus();
  await page.keyboard.press("Escape");
  await panel
    .getByRole("button", { name: "Thêm panel.png vào Cảnh" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const withUi = await (
    await page.request.get(api(`/games/${gameId}/engine-project`))
  ).json();
  const uiObject = withUi.project.scenes[0].objects.find(
    (candidate: { components: Array<{ type: string }> }) =>
      candidate.components.some((component) => component.type === "UIImage"),
  );
  const uiLayer = withUi.project.scenes[0].layers.find(
    (layer: { id: string }) => layer.id === uiObject.layerId,
  );
  expect(uiLayer.type).toBe("UI");
  expect(
    uiObject.components.find(
      (component: { type: string }) => component.type === "UIImage",
    ).properties.assetId,
  ).toBe(withUi.project.assetIds[1]);

  await manager.getByRole("button", { name: "Người dùng", exact: true }).click();
  await manager.getByLabel("Tải tài nguyên lên").setInputFiles({
    name: "unused.png",
    mimeType: "image/png",
    buffer: png,
  });
  const unused = manager.getByRole("group", { name: "Tài nguyên unused.png" });
  await expect(unused).toBeVisible();
  await unused.getByRole("button", { name: "Xóa tài nguyên" }).click();
  const deletion = page.getByRole("dialog", { name: "Xóa unused.png?" });
  await expect(
    deletion.getByRole("button", { name: "Xác nhận xóa" }),
  ).toBeEnabled();
  await deletion.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(unused).toHaveCount(0);
  const tombstoned = await (
    await page.request.get(
      api(`/games/${gameId}/assets?state=TOMBSTONED&search=unused`),
    )
  ).json();
  expect(tombstoned.items).toHaveLength(1);
  expect(tombstoned.items[0]).toMatchObject({
    displayName: "unused.png",
    state: "TOMBSTONED",
  });
});
