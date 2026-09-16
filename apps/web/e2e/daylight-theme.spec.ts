import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`daylight illustration and surfaces switch together at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "Giao diện: mặc định TFG", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage)).toContain("tfg-daylight-world.png");
    expect(await page.evaluate(() => getComputedStyle(document.body, "::before").opacity)).toBe("1");
    expect((await page.request.get("/art/tfg-daylight-world.png")).ok()).toBe(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`daylight-home-${width}.png`), fullPage: true });
    if (width === 390) await expect(page.locator(".mobile-dock")).toHaveCSS("background-color", "rgba(255, 253, 246, 0.96)");
    for (const route of ["/discover", "/login", "/games/tiny-quest"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`daylight-${route.replaceAll("/", "-")}-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Giao diện: sáng", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage)).toContain("tfg-twilight-world.png");
  });
}
