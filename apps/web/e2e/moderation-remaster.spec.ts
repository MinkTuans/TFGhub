import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`review queue fits ${width}px and preserves decision context`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    const suffix = randomUUID();
    expect((await page.request.post("/api/auth/register", { data: { email: `review-${suffix}@example.com`, password: "password123" } })).ok()).toBe(true);
    const created = await page.request.post("/api/games", { data: { title: "Review layout", slug: `review-${suffix}`, sourceType: "CODE", description: "A submitted game to check." } });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();
    expect((await page.request.put(`/api/games/${id}/project`, { data: { sourceType: "CODE", html: "<h1>Ready to play</h1>", css: "", javascript: "" } })).ok()).toBe(true);
    expect((await page.request.post(`/api/games/${id}/build`, { data: {} })).ok()).toBe(true);
    expect((await page.request.post(`/api/games/${id}/submit`, { data: {} })).ok()).toBe(true);
    await page.context().clearCookies();
    expect((await page.request.post("/api/auth/login", { data: { email: "moderator@example.com", password: "moderator-password123" } })).ok()).toBe(true);
    await page.goto("/moderation");
    const card = page.getByRole("article", { name: "Review layout", exact: true });
    await expect(card.getByTitle("Chơi thử trò chơi")).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`queue-${width}.png`), fullPage: true });
    await card.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(card.getByRole("heading", { name: "Quyết định kiểm duyệt" })).toBeVisible();
    await expect(card.locator("time")).toContainText("UTC");
    await expect(card.getByRole("button", { name: "Từ chối", exact: true })).toBeDisabled();
    await expect(card.getByTitle("Chơi thử trò chơi").contentFrame().getByRole("heading", { name: "Ready to play" })).toBeVisible();
    const decisionHeading = await card.getByRole("heading", { name: "Quyết định kiểm duyệt" }).boundingBox();
    const decisionHint = await card.getByText("Chơi thử và kiểm tra nội dung. Nếu từ chối, ghi rõ điều tác giả cần sửa.").boundingBox();
    expect(decisionHint!.y - decisionHeading!.y - decisionHeading!.height).toBeGreaterThanOrEqual(8);
    const previewBox = await card.getByTitle("Chơi thử trò chơi").boundingBox();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.width / previewBox!.height).toBeCloseTo(16 / 9, 1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; window.scrollTo(0, 0); }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`moderation-${width}-${theme}.png`), fullPage: true });
    }
    await card.getByLabel("Lý do từ chối").fill("Bổ sung hướng dẫn chơi.");
    await card.getByRole("button", { name: "Từ chối", exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText("Đã từ chối trò chơi.", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
