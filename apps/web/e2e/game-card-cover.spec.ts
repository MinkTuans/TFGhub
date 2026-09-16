import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`cover initials and actions remain separate at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("tfg-theme", value), theme);
      for (const route of ["/", "/discover"]) {
        await page.goto(route);
        const cards = page.locator(".game-card").filter({ has: page.getByTestId("game-cover-fallback") });
        await expect(cards.first()).toBeVisible();
        for (const card of await cards.all()) {
          await card.focus();
          const initials = await card.locator(".game-cover__fallback strong").boundingBox();
          const action = await card.locator(".game-card__action").boundingBox();
          expect(initials).not.toBeNull();
          expect(action).not.toBeNull();
          expect(initials!.y + initials!.height).toBeLessThanOrEqual(action!.y);
          const brand = card.locator(".game-cover__brand");
          if (await brand.isVisible()) {
            const badge = (await brand.boundingBox())!;
            expect(badge.x + badge.width <= initials!.x || initials!.x + initials!.width <= badge.x || badge.y + badge.height <= initials!.y || initials!.y + initials!.height <= badge.y).toBe(true);
          }
          expect(await card.locator("button, a").count()).toBe(0);
          expect(await card.locator(".game-cover__fallback strong").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(32);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${route === "/" ? "home" : "discover"}.png`), fullPage: true });
      }
      await page.goto("/games/tiny-quest");
      const compact = page.locator(".game-card--compact").first();
      await expect(compact).toBeVisible();
      const cover = await compact.locator(".game-cover").boundingBox();
      const initials = await compact.locator(".game-cover__fallback strong").boundingBox();
      expect(initials!.x).toBeGreaterThanOrEqual(cover!.x);
      expect(initials!.x + initials!.width).toBeLessThanOrEqual(cover!.x + cover!.width);
      expect(initials!.y).toBeGreaterThanOrEqual(cover!.y);
      expect(initials!.y + initials!.height).toBeLessThanOrEqual(cover!.y + cover!.height);
      await expect(compact.locator(".game-card__action")).toHaveCount(0);
    });
  }
}
