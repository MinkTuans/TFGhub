import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1024, 1440]) {
  test(`populated profile fits ${width}px with reduced motion and private game links`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 1000 });
    const suffix = randomUUID();
    expect((await page.request.post("/api/auth/register", { data: { email: `profile-${suffix}@example.com`, password: "password123" } })).ok()).toBe(true);
    expect((await page.request.put("/api/developers/me", { data: { displayName: "Nhà sáng tạo", bio: "Những ý tưởng nhỏ và thế giới mới." } })).ok()).toBe(true);
    const created = await page.request.post("/api/games", { data: { title: "Private creation", slug: `private-${suffix}`, sourceType: "UPLOAD", description: "My unpublished game" } });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Nhà sáng tạo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Private creation", exact: true })).toHaveAttribute("href", `/studio/games/${id}`);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; window.scrollTo(0, 0); }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`profile-${width}-${theme}.png`), fullPage: true });
    }
    await page.getByLabel("Tên hiển thị").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Giới thiệu")).toBeFocused();
    expect(errors).toEqual([]);
  });
}
