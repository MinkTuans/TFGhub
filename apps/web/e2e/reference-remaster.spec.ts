import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`illustrated default, account layout and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    const art = await page.request.get("/art/tfg-twilight-world.png");
    expect(art.ok()).toBe(true);
    expect(art.headers()["content-type"]).toContain("image/png");
    expect(await page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage)).toContain("tfg-twilight-world.png");
    const dock = page.getByRole("navigation", { name: "Điều hướng nhanh", exact: true });
    if (width < 769) {
      await expect(dock).toBeVisible();
      await dock.getByRole("link", { name: "Khám phá", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/discover$/);
      await expect(dock.getByRole("link", { name: "Khám phá", exact: true })).toHaveAttribute("aria-current", "page");
    } else await expect(dock).not.toBeVisible();
    await page.goto("/login");
    const panel = await page.locator(".auth-panel").boundingBox();
    expect(panel).not.toBeNull();
    expect(Math.abs(panel!.x + panel!.width / 2 - width / 2)).toBeLessThan(2);
    await expect(page.locator(".auth-story")).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`login-reference-${width}.png`), fullPage: true });
  });
}

for (const viewport of [{ width: 390, height: 667 }, { width: 667, height: 390 }]) {
  test(`Play anchor keeps controls and game above the dock at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/games/tiny-quest");
    await page.getByRole("link", { name: "Chơi ngay", exact: true }).click();
    const player = page.getByRole("region", { name: "Chơi Tiny Quest", exact: true });
    await expect.poll(async () => (await player.boundingBox())!.y).toBeLessThan(110);
    const box = await player.boundingBox();
    const dock = await page.getByRole("navigation", { name: "Điều hướng nhanh", exact: true }).boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(70);
    expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y);
    await expect(player.getByRole("button", { name: "Mở toàn màn hình" })).toBeInViewport();
  });
}
