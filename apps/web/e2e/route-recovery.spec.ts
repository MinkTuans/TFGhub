import { expect, test } from "@playwright/test";

test.afterEach(async ({ request }) => {
  await request.post("/__test/api-fault?mode=off");
});

test("a page API outage recovers through retry while keeping navigation", async ({ page, request }) => {
  await request.post("/__test/api-fault?mode=game");
  await page.goto("/games/tiny-quest");
  await expect(page.getByRole("heading", { name: "Không thể tải trang lúc này" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
  await expect(page.getByText("test-only upstream failure")).toHaveCount(0);
  await request.post("/__test/api-fault?mode=off");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tiny Quest" })).toBeVisible();
});

test("root session outages get a complete fallback document and can retry", async ({ page, request }) => {
  await request.post("/__test/api-fault?mode=session");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Không thể tải trang lúc này" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page).toHaveTitle("Không thể tải trang | TFG");
  await expect(page.getByText("test-only upstream failure")).toHaveCount(0);
  await request.post("/__test/api-fault?mode=off");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Every great game starts with a small idea." })).toBeVisible();
});

test("slow catalog requests show loading content before the real games", async ({ page, request }) => {
  await request.post("/__test/api-fault?mode=discover-delay");
  await page.goto("/discover", { waitUntil: "commit" });
  await expect(page.getByRole("status")).toHaveText("Đang tải nội dung…");
  await expect(page.getByRole("heading", { name: "Tiny Quest", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});
