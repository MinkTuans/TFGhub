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

test("slow catalog searches show progress before the next results", async ({ page, request }) => {
  await page.goto("/discover");
  await request.post("/__test/api-fault?mode=discover-delay");
  await page.getByRole("textbox", { name: "Tìm kiếm game" }).fill("Tiny Quest");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đang tìm kiếm game…");
  await expect(page.getByRole("heading", { name: "Kết quả cho “Tiny Quest”", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tìm kiếm", exact: true })).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
});
