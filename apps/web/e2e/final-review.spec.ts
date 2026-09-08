import { expect, test } from "@playwright/test";

test("navigation identifies the active page with a visible shape after client navigation", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Điều hướng chính" });
  await navigation.getByRole("link", { name: "Khám phá" }).click();
  const active = navigation.getByRole("link", { name: "Khám phá" });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(active).toHaveCSS("text-decoration-line", "underline");
  await expect(active).toHaveCSS("text-decoration-thickness", "3px");
  await expect(navigation.getByRole("link", { name: "Trang chủ" })).not.toHaveAttribute("aria-current");
});

test("missing routes offer Vietnamese recovery inside the TFG shell", async ({ page }) => {
  await page.goto("/missing-final-review-page");
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeVisible();
  await page.getByRole("link", { name: "Về trang chủ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("shared sizing, spacing and transition tokens drive rendered controls", async ({ page }) => {
  await page.goto("/discover");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--content-width", "50rem");
    document.documentElement.style.setProperty("--space-5", "30px");
    document.documentElement.style.setProperty("--transition-fast", "230ms");
  });
  await expect(page.locator("main")).toHaveCSS("width", "800px");
  await expect(page.locator(".site-header__inner")).toHaveCSS("gap", "30px");
  await expect(page.getByRole("button", { name: "Tìm kiếm", exact: true })).toHaveCSS("transition-duration", "0.23s, 0.23s, 0.23s, 0.23s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Tìm kiếm", exact: true })).toHaveCSS("transition-duration", "1e-05s");
});

test("TFG mark includes a cyan-violet gradient detail", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByRole("img", { name: "TFG", exact: true });
  await expect(logo.locator("linearGradient stop")).toHaveCount(2);
  const stops = await logo.locator("linearGradient stop").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).stopColor));
  expect(stops[0]).not.toBe(stops[1]);
  await expect(logo.locator('path[stroke^="url("]')).toHaveCount(1);
});
