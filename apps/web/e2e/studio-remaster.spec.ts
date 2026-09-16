import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`Studio filters and creation layout fit ${width}px in both themes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const suffix = randomUUID();
    expect((await page.request.post("/api/auth/register", { data: { email: `studio-${suffix}@example.com`, password: "password123" } })).ok()).toBe(true);
    for (const title of ["Zebra", "Alpha"]) {
      expect((await page.request.post("/api/games", { data: { title, slug: `${title.toLowerCase()}-${suffix}`, sourceType: "UPLOAD", description: "Forest adventure" } })).ok()).toBe(true);
    }
    await page.goto("/studio");
    await page.getByLabel("Tìm trò chơi của bạn").fill(" FOREST ");
    await expect(page.getByRole("status")).toHaveText("2 / 2 trò chơi");
    await page.getByLabel("Trạng thái duyệt").selectOption("APPROVED");
    await expect(page.getByRole("heading", { name: "Không có trò chơi phù hợp" })).toBeVisible();
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await page.getByLabel("Sắp xếp").selectOption("title");
    await expect(page.locator(".studio-card h3")).toHaveText(["Alpha", "Zebra"]);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`studio-${width}-${theme}.png`), fullPage: true });
    }
    await page.getByRole("link", { name: "Alpha", exact: true }).click();
    await page.getByRole("navigation", { name: "Các phần quản lý trò chơi" }).getByRole("link", { name: "Hiển thị", exact: true }).click();
    await expect(page).toHaveURL(/#display-heading$/);
    await expect(page.getByRole("heading", { name: "Cài đặt hiển thị" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`manage-${width}.png`), fullPage: true });
    await page.goto("/studio/games/new");
    await expect(page.getByRole("button", { name: "Tạo bản nháp", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`create-${width}.png`), fullPage: true });
  });
}
