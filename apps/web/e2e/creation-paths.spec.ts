import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [390, 1280]) {
  test(`Pixel and HTML5 creation paths fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const suffix = randomUUID();
    expect((await page.request.post("/api/auth/register", {
      data: { email: `creation-${suffix}@example.test`, password: "Password123!" },
    })).status()).toBe(201);
    await page.goto("/studio/games/new");
    await expect(page.getByRole("button", { name: "Tạo game Pixel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tải game HTML5/ZIP" })).toBeVisible();
    await expectNoOverflow(page);

    await page.getByRole("button", { name: "Tạo game Pixel" }).click();
    await expect(page.getByRole("radio", { name: /Khuyên dùng/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Dự án 2D trống/ })).toBeVisible();
    await expectNoOverflow(page);
    // The isolated harness has legacy persistence only; component tests verify
    // the ENGINE request and the real Studio actions without replacing the API.
    await page.getByRole("button", { name: "Tải game HTML5/ZIP" }).click();
    await expect(page.getByLabel("Cách tạo trò chơi")).toHaveValue("UPLOAD");
    await page.getByLabel("Tên trò chơi").fill(`Upload ${suffix}`);
    await page.getByLabel("Đường dẫn", { exact: true }).fill(`upload-${suffix}`);
    await expectNoOverflow(page);
    await page.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
    await expect(page).toHaveURL("/studio");
    await page.getByRole("link", { name: `Upload ${suffix}`, exact: true }).click();
    await expect(page.getByLabel("Tệp ZIP HTML5")).toBeVisible();
    await expectNoOverflow(page);
  });
}
