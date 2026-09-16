import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`account forms fit ${width}px and support password visibility`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ["login", "register"]) {
      await page.goto(`/${mode}`);
      const password = page.getByLabel("Mật khẩu", { exact: true });
      await password.fill("private-password123");
      await page.getByRole("button", { name: "Hiện mật khẩu", exact: true }).click();
      await expect(password).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
      await expect(password).toHaveAttribute("type", "password");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${width}.png`), fullPage: true });
    }
  });
}

test("a failed profile save after registration retries only that save", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  let registrations = 0;
  let profileWrites = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/auth/register")) registrations += 1;
  });
  await page.route("**/api/developers/me", async (route) => {
    if (route.request().method() === "PUT" && ++profileWrites === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "test outage" }) });
    } else await route.continue();
  });
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị").fill("Recovery creator");
  await page.getByLabel("Email").fill(`recovery-${randomUUID()}@example.com`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("password123");
  await page.getByLabel("Xác nhận mật khẩu").fill("does-not-match");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Mật khẩu xác nhận chưa khớp.");
  expect(registrations).toBe(0);
  await page.getByLabel("Xác nhận mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Không thể lưu hồ sơ");
  await expect(page.getByRole("status")).toContainText("Tài khoản đã được tạo");
  await page.getByRole("button", { name: "Thử lưu hồ sơ" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  expect(registrations).toBe(1);
  expect(profileWrites).toBe(2);
  await page.goto("/profile");
  await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Recovery creator");
  await expect(page.getByRole("heading", { name: "Chưa có game nào" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-390.png"), fullPage: true });
});
