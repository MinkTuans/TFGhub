import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`Home and shell fit ${width}px with real catalog content`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Every great game starts with a small idea." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tiny Quest", exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
    if (width <= 768) {
      await expect(nav).not.toBeVisible();
      const toggle = page.getByRole("button", { name: "Mở menu điều hướng" });
      await toggle.click();
      await nav.getByRole("link", { name: "Khám phá", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(nav).not.toBeVisible();
      await toggle.click();
    }
    await nav.getByRole("link", { name: "Khám phá", exact: true }).click();
    await expect(page).toHaveURL(/\/discover$/);
    if (width <= 768) await expect(nav).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/");
    await page.screenshot({ path: testInfo.outputPath(`home-${width}-light.png`), fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}-dark.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
