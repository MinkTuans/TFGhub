import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`catalog search and game information at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/discover");
    await page.getByRole("textbox", { name: "Tìm kiếm game" }).fill("no-such-game");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Chưa có game phù hợp." })).toBeVisible();
    await page.getByRole("link", { name: "Xem tất cả game", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tiny Quest", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`discover-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Chơi Tiny Quest", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Thông tin game" })).toBeVisible();
    await expect(page.getByText("Bản dựng #1", { exact: true })).toBeVisible();
    await expect(page.getByTitle("Chơi Tiny Quest")).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`game-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("related-game artwork leaves the available sidebar width for its text", async ({ page }) => {
  await page.goto("/games/tiny-quest");
  const card = page.getByRole("complementary", { name: "Game liên quan" }).getByRole("link").first();
  const cover = await card.locator(".game-cover").boundingBox();
  const body = await card.locator(".game-card__body").boundingBox();
  expect(cover).not.toBeNull();
  expect(body).not.toBeNull();
  expect(body!.x - (cover!.x + cover!.width)).toBeLessThanOrEqual(1);
});
