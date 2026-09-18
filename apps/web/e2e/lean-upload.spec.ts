import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const externalServices = process.env.E2E_EXTERNAL_SERVICES === "1";
const moderatorEmail = process.env.E2E_MODERATOR_EMAIL ?? (externalServices ? "" : "moderator@example.com");
const moderatorPassword = process.env.E2E_MODERATOR_PASSWORD ?? (externalServices ? "" : "Moderator-password123!");

// A hand-built ZIP keeps this acceptance fixture independent of production archive code.
const relativeAssetZip = Buffer.from(
  "UEsDBBQAAAAIAAAAAABRBK8dXgAAAHkAAAAKAAAAaW5kZXguaHRtbD2NQQqAMAwEvxL7AEvvMY/wB9EGK7ZUmiD094IFL3NYhh2cYt2t3wLJSiYc3GrshCnQKpntfARYVQyacOzoUyA8ywGcbXG/Urhd0hxo2xf3+erHNutzOEI/bv3XeAFQSwMEFAAAAAgAAAAAAFEnG65VAAAAawAAABEAAABhc3NldHMvbWFya2VyLnN2Z23MywqAIBBA0V+Rae9MRZtQP6aXCvZAB6fPD/ftLhy4plSv3jNdxUJgfmZEEdEy6jt7HIgIS/WgJG4cLPSgwh594JbO5H3lX1JHTMlCR8sE6Ex7uA9QSwECFAMUAAAACAAAAAAAUQSvHV4AAAB5AAAACgAAAAAAAAAAAAAApIEAAAAAaW5kZXguaHRtbFBLAQIUAxQAAAAIAAAAAABRJxuuVQAAAGsAAAARAAAAAAAAAAAAAACkgYYAAABhc3NldHMvbWFya2VyLnN2Z1BLBQYAAAAAAgACAHcAAAAKAQAAAAA=",
  "base64",
);

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị").fill("Upload creator");
  await page.getByLabel("Xác nhận mật khẩu").fill("Password123!");
  await page.getByLabel("Thư điện tử").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL("/studio");
}

test("a relative-asset ZIP previews after reload, is moderated before public play, and cannot be replaced by another creator", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!moderatorEmail || !moderatorPassword, "External moderation requires disposable moderator credentials.");
  test.setTimeout(120_000);
  const suffix = randomUUID();
  const title = `Lean upload ${suffix}`;
  const slug = `lean-upload-${suffix}`;

  await register(page, `lean-upload-${suffix}@example.com`);
  const draft = await page.request.post("/api/games", {
    data: { title, slug, sourceType: "UPLOAD", description: "Relative asset game." },
  });
  expect(draft.status()).toBe(201);
  const gameId = (await draft.json() as { id: string }).id;
  await page.goto("/studio");
  await page.getByRole("link", { name: title, exact: true }).click();

  await page.getByLabel("Tệp ZIP HTML5").setInputFiles({
    name: "relative-assets.zip",
    mimeType: "application/zip",
    buffer: relativeAssetZip,
  });
  await page.getByRole("button", { name: "Tải trò chơi lên" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã tải lên. Bản chơi thử đã sẵn sàng.");
  const preview = page.getByTitle("Chơi thử trò chơi");
  await expect(preview.contentFrame().getByRole("heading", { name: "Relative asset ready" })).toBeVisible();
  await expect.poll(() =>
    preview.contentFrame().getByAltText("Relative marker").evaluate((node) =>
      (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 1,
    ),
  ).toBe(true);

  await page.reload();
  const reloadedPreview = page.getByTitle("Chơi thử trò chơi");
  await expect(reloadedPreview.contentFrame().getByRole("heading", { name: "Relative asset ready" })).toBeVisible();
  await expect.poll(() =>
    reloadedPreview.contentFrame().getByAltText("Relative marker").evaluate((node) =>
      (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Chờ duyệt");

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Thư điện tử").fill(moderatorEmail);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(moderatorPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("link", { name: "Kiểm duyệt" }).click();
  const queued = page.getByRole("article", { name: title });
  await queued.getByText("Kiểm tra bản gửi", { exact: true }).click();
  await queued.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã duyệt trò chơi.");

  const stranger = await browser.newContext({ baseURL });
  try {
    const attacker = await stranger.newPage();
    await register(attacker, `lean-attacker-${suffix}@example.com`);
    const denied = await attacker.request.post(`/api/games/${gameId}/upload`, {
      headers: { Origin: baseURL! },
      multipart: {
        game: {
          name: "replacement.zip",
          mimeType: "application/zip",
          buffer: relativeAssetZip,
        },
      },
    });
    expect(denied.status()).toBe(403);
  } finally {
    await stranger.close();
  }

  await page.context().clearCookies();
  await page.goto(`/games/${slug}`);
  const player = page.getByTitle(`Chơi ${title}`, { exact: true });
  await expect(player.contentFrame().getByRole("heading", { name: "Relative asset ready" })).toBeVisible();
  await expect.poll(() =>
    player.contentFrame().getByAltText("Relative marker").evaluate((node) =>
      (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 1,
    ),
  ).toBe(true);
});
