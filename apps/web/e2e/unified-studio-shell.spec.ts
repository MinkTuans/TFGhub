import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// ENGINE uses real Prisma revisions. Run only against an explicitly selected
// disposable stack: E2E_EXTERNAL_SERVICES=1 E2E_STUDIO_SHELL=1 E2E_WEB_URL=…
test.skip(
  process.env.E2E_EXTERNAL_SERVICES !== "1" ||
    process.env.E2E_STUDIO_SHELL !== "1",
  "Unified Studio requires an explicitly opted-in disposable PostgreSQL/API stack",
);

const apiBase = (process.env.E2E_API_URL ?? "/api").replace(/\/$/, "");
const api = (path: string) => `${apiBase}${path}`;

async function createProject(page: Page) {
  const suffix = randomUUID();
  const register = await page.request.post(api("/auth/register"), {
    data: {
      email: `studio-shell-${suffix}@example.test`,
      password: "studio-password123",
    },
  });
  expect(register.status()).toBe(201);
  await page.goto("/studio/games/new");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page.getByRole("main", { name: "Game Studio" })).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  const gameId = page.url().split("/").at(-1)!;
  return { gameId, suffix };
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => {
    throw new Error(
      `Unexpected browser dialog: ${dialog.type()} ${dialog.message()}`,
    );
  });
});

test("scene and layer edits autosave canonical revisions, survive reload, and undo confirmed deletion", async ({
  page,
}) => {
  const { gameId } = await createProject(page);
  const status = page.getByRole("status", { name: "Trạng thái dự án" });
  const read = async () =>
    (
      await (
        await page.request.get(api(`/games/${gameId}/engine-project`))
      ).json()
    ).project;
  const before = await read();
  await page.getByRole("button", { name: "Thêm Scene", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tên Scene", exact: true })
    .fill("Island");
  await page.getByRole("combobox", { name: "Loại Scene" }).selectOption("MAP");
  await page.getByRole("spinbutton", { name: "Chiều rộng Scene" }).fill("1200");
  await page.getByRole("spinbutton", { name: "Trọng lực Y" }).fill("250");
  await page.getByRole("checkbox", { name: "Bật lưới" }).check();
  await page.getByRole("button", { name: "Lưu Scene", exact: true }).click();
  await page.getByRole("button", { name: "Đặt làm Scene bắt đầu" }).click();
  await page.getByRole("button", { name: "Đưa Scene lên" }).click();
  await page.getByRole("button", { name: "Thêm lớp", exact: true }).click();
  const layer = page.getByRole("group", { name: "Lớp mới", exact: true });
  await layer.getByRole("textbox", { name: "Tên lớp" }).fill("HUD");
  await layer.getByRole("combobox", { name: "Loại lớp" }).selectOption("UI");
  await layer.getByRole("checkbox", { name: "Hiện lớp" }).uncheck();
  await layer.getByRole("checkbox", { name: "Khóa lớp" }).check();
  await layer.getByRole("button", { name: "Lưu lớp" }).click();
  await page
    .getByRole("group", { name: "HUD", exact: true })
    .getByRole("button", { name: "Đưa lớp lên" })
    .click();
  await expect(status).toHaveText("Đã lưu");
  const saved = await read();
  expect(saved.scenes).toHaveLength(2);
  const island = saved.scenes.find(
    (scene: { name: string }) => scene.name === "Island",
  );
  expect(island).toMatchObject({
    type: "MAP",
    width: 1200,
    order: 0,
    settings: { gravityY: 250, grid: { enabled: true } },
  });
  expect(saved.entrySceneId).toBe(island.id);
  expect(
    island.layers.find((layer: { name: string }) => layer.name === "HUD"),
  ).toMatchObject({ type: "UI", visible: false, locked: true, order: 0 });
  await page.reload();
  await expect(status).toHaveText("Đã lưu");
  expect(await read()).toEqual(saved);
  await expect(
    page.getByRole("textbox", { name: "Tên Scene", exact: true }),
  ).toHaveValue("Island");
  await page
    .getByRole("button", { name: "Nhân bản Scene", exact: true })
    .click();
  await expect(status).toHaveText("Đã lưu");
  const duplicated = await read();
  expect(duplicated.scenes).toHaveLength(3);
  expect(duplicated.scenes[2].layers[0].id).not.toBe(island.layers[0].id);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(status).toHaveText("Đã lưu");
  expect(await read()).toEqual(saved);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(status).toHaveText("Đã lưu");
  expect(await read()).toEqual(duplicated);
  await page
    .getByRole("combobox", { name: "Scene hiện tại" })
    .selectOption(island.id);
  await page.getByRole("button", { name: "Xóa Scene", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Xóa Scene", exact: true });
  await expect(dialog.getByRole("button", { name: "Hủy" })).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Xác nhận xóa" }),
  ).toBeDisabled();
  await dialog
    .getByRole("combobox", { name: "Scene bắt đầu thay thế" })
    .selectOption(before.entrySceneId);
  await dialog.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status).toHaveText("Đã lưu");
  expect((await read()).scenes).toHaveLength(2);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(status).toHaveText("Đã lưu");
  expect(await read()).toEqual(duplicated);
  await page.reload();
  await expect(status).toHaveText("Đã lưu");
  expect(await read()).toEqual(duplicated);
  await expectNoOverflow(page);
});

test("desktop opens a full-width dark shell, reads the saved Scene, collapses panels and saves the title", async ({
  page,
}, testInfo) => {
  const { gameId, suffix } = await createProject(page);
  const shell = page.getByRole("main", { name: "Game Studio" });
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator("body > footer")).toBeHidden();
  expect(await shell.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1440 });
  await expect(shell).toHaveCSS("background-color", "rgb(12, 18, 32)");
  await expect(shell).toHaveCSS("color", "rgb(237, 242, 255)");
  await expect(page.getByRole("button", { name: "Hoàn tác" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Làm lại" })).toBeDisabled();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Chạy thử|Xuất bản|Thêm đối tượng|Tài nguyên|Mã nguồn|Kiểm tra|AI/,
    }),
  ).toHaveCount(0);

  // Read a saved rename through the real API and confirm local navigation
  // does not advance the revision. Two-Scene selection is covered in unit tests.
  const read = await (
    await page.request.get(api(`/games/${gameId}/engine-project`))
  ).json();
  const sceneId = read.project.scenes[0].id;
  read.project.scenes[0].name = "Bến cảng";
  const saved = await page.request.post(
    api(`/games/${gameId}/engine-project/mutations`),
    {
      data: {
        baseRevision: read.revision.revisionNumber,
        mutationId: randomUUID(),
        mutations: [{ type: "scene.rename", sceneId, name: "Bến cảng" }],
      },
    },
  );
  expect(saved.status()).toBe(201);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Scene hiện tại" })
    .selectOption(sceneId);
  await expect(
    page
      .getByRole("region", { name: "Tổng quan Scene" })
      .getByRole("heading", { name: "Bến cảng" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bến cảng" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const sceneRead = await (
    await page.request.get(api(`/games/${gameId}/engine-project`))
  ).json();
  expect(sceneRead.revision.revisionNumber).toBe(1);
  expect(sceneRead.project).toEqual(read.project);

  const title = page.getByRole("textbox", { name: "Tên game" });
  await title.fill(`Studio ${suffix}`);
  await page.getByRole("button", { name: "Lưu tên" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái tên game" }),
  ).toHaveText("Đã lưu tên");
  await page.reload();
  await expect(title).toHaveValue(`Studio ${suffix}`);
  await expect(
    page.getByRole("status", { name: "Trạng thái dự án" }),
  ).toHaveText("Đã lưu");
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("studio-desktop.png"),
    fullPage: true,
  });

  const settings = page.getByRole("button", { name: "Cài đặt Studio" });
  await settings.focus();
  await expect(page.getByRole("tooltip")).toContainText("Bố cục");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Cài đặt Studio" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Hiện thông tin Scene" }).uncheck();
  await expect(
    page.getByRole("region", { name: "Thông tin Scene" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mở thông tin Scene" }).click();
  await expect(
    page.getByRole("region", { name: "Thông tin Scene" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Hiện danh sách Scene" }).focus();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Cài đặt Studio" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Thu gọn danh sách Scene" }).click();
  await expect(
    page.getByRole("navigation", { name: "Danh sách Scene" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mở danh sách Scene" }).click();
  await expect(
    page.getByRole("navigation", { name: "Danh sách Scene" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Về Studio" }).click();
  await expect(page).toHaveURL("/studio");
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator("body > footer")).toBeVisible();
});

test("mobile presents metadata-only editing with readable controls and persists title changes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { suffix } = await createProject(page);
  await expect(page.getByRole("navigation", { name: "Điều hướng nhanh" })).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body, "::before").display)).toBe("none");
  await expect(
    page.getByRole("region", { name: "Studio trên thiết bị di động" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Scene hiện tại" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hoàn tác" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cài đặt Studio" }),
  ).toHaveCount(0);
  const title = page.getByRole("textbox", { name: "Tên game" });
  await title.fill(`Mobile ${suffix}`);
  await page.getByRole("button", { name: "Lưu tên" }).click();
  await expect(
    page.getByRole("status", { name: "Trạng thái tên game" }),
  ).toHaveText("Đã lưu tên");
  await page.reload();
  await expect(title).toHaveValue(`Mobile ${suffix}`);
  const controls = await page
    .getByRole("main")
    .locator("input, button, a")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => ({
          size: parseFloat(getComputedStyle(element).fontSize),
          height: element.getBoundingClientRect().height,
        })),
    );
  expect(
    controls.every((control) => control.size >= 14 && control.height >= 40),
  ).toBe(true);
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("studio-mobile.png"),
    fullPage: true,
  });
});

for (const sourceType of ["UPLOAD", "CODE", "STORY", "PLATFORMER"]) {
  test(`${sourceType} keeps legacy layout and metadata saving after navigating out of ENGINE`, async ({
    page,
  }, testInfo) => {
    const { suffix } = await createProject(page);
    const created = await page.request.post(api("/games"), {
      data: {
        title: `${sourceType} ${suffix}`,
        slug: `legacy-${suffix}`,
        sourceType,
      },
    });
    expect(created.status()).toBe(201);
    await page.getByRole("link", { name: "Về Studio" }).click();
    await page
      .getByRole("link", { name: `${sourceType} ${suffix}`, exact: true })
      .click();
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator("body > footer")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ảnh bìa và thông tin" }),
    ).toBeVisible();
    await expect(page.getByRole("main", { name: "Game Studio" })).toHaveCount(
      0,
    );
    expect((await page.locator("main").boundingBox())!.x).toBeGreaterThan(0);
    await page.getByLabel("Chiều rộng hiển thị").fill("4");
    await page.getByLabel("Chiều cao hiển thị").fill("3");
    await page.getByRole("button", { name: "Lưu hiển thị" }).click();
    await expect(
      page.getByRole("button", { name: "Lưu hiển thị" }),
    ).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel("Chiều rộng hiển thị")).toHaveValue("4");
    await expect(page.getByLabel("Chiều cao hiển thị")).toHaveValue("3");
    await expectNoOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`legacy-${sourceType.toLowerCase()}.png`),
      fullPage: true,
    });
  });
}
