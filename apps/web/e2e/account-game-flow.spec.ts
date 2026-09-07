import { randomUUID } from "node:crypto";
import { expect, test as base, type Locator } from "@playwright/test";

const test = base.extend<{ googleRequests: string[] }>({
  googleRequests: [async ({ context }, use) => {
    const requests: string[] = [];
    context.on("request", (request) => {
      const host = new URL(request.url()).hostname;
      if (host.includes("googlesyndication.com") || host.includes("doubleclick.net")) {
        requests.push(request.url());
      }
    });
    await use(requests);
    expect(requests, "Disabled advertising must make no Google ad requests").toEqual([]);
  }, { auto: true }],
});

// Valid 1×1 PNG; exercise real multipart parsing, image validation and storage.
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
  "base64",
);

async function expectLoadedCover(cover: Locator) {
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((element) => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth === 1 && image.naturalHeight === 1;
  })).toBe(true);
}

const externalServices = process.env.E2E_EXTERNAL_SERVICES === "1";
const moderatorEmail = process.env.E2E_MODERATOR_EMAIL ?? (externalServices ? "" : "moderator@example.com");
const moderatorPassword = process.env.E2E_MODERATOR_PASSWORD ?? (externalServices ? "" : "moderator-password123");

test("same-origin gateway preserves cookies, query strings, origin checks and artifact redirects", async ({ request, baseURL }) => {
  test.skip(externalServices, "Verifies the local production-shaped gateway and seed.");
  const email = `gateway-${randomUUID()}@example.com`;
  const registration = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: { email, password: "password123" },
  });
  expect(registration.status()).toBe(201);
  expect(registration.headers()["set-cookie"]).toContain("indieforge_access=");
  expect(registration.headers()["set-cookie"]).toContain("HttpOnly");
  expect(registration.headers()["set-cookie"]).toContain("SameSite=Lax");
  const session = await request.get("/api/auth/me");
  expect(session.status()).toBe(200);
  expect(await session.json()).toMatchObject({ email });
  const untrusted = await request.post("/api/games", {
    headers: { Origin: "https://untrusted.example" },
    data: { title: "Blocked request", slug: `blocked-${randomUUID()}` },
  });
  expect(untrusted.status()).toBe(403);
  expect(await untrusted.json()).toMatchObject({ message: "Untrusted request origin" });
  const discovery = await request.get("/api/discover?query=Tiny%20Quest");
  expect(discovery.status()).toBe(200);
  expect((await discovery.json()).games.map((game: { slug: string }) => game.slug)).toEqual(["tiny-quest"]);
  const play = await request.get("/api/play/tiny-quest/", { maxRedirects: 0 });
  expect(play.status()).toBe(302);
  const location = play.headers().location;
  expect(location).toMatch(/^\.\.\/\.\.\/game-content\//);
  const artifactUrl = new URL(location, `${baseURL}/api/play/tiny-quest/`);
  expect(artifactUrl.pathname).toMatch(/^\/api\/game-content\//);
  const artifact = await request.get(artifactUrl.href);
  expect(artifact.status()).toBe(200);
  expect(artifact.headers()["content-type"]).toContain("text/html");
  expect(artifact.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await artifact.text()).toContain("<h1>Tiny Quest</h1>");
});

test("theme preference persists across reload and overrides the system until reset", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await page.getByRole("button", { name: "Giao diện: theo hệ thống", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveCSS("color-scheme", "light");
  await page.reload();
  await expect(page.getByRole("button", { name: "Giao diện: sáng", exact: true })).toBeVisible();
  await expect(root).toHaveCSS("color-scheme", "light");
  expect(await page.evaluate(() => localStorage.getItem("tfg-theme"))).toBe("light");
  await page.getByRole("button", { name: "Giao diện: sáng", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Giao diện: tối", exact: true })).toBeVisible();
  await expect(root).toHaveCSS("color-scheme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("tfg-theme"))).toBe("dark");
  await page.getByRole("button", { name: "Giao diện: tối", exact: true }).click();
  await expect(root).not.toHaveAttribute("data-theme");
  await expect(root).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveCSS("color-scheme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Giao diện: theo hệ thống", exact: true })).toBeVisible();
  await expect(root).not.toHaveAttribute("data-theme");
  await expect(root).toHaveCSS("color-scheme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("tfg-theme"))).toBe("system");
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} desktop acceptance`, () => {
    test.skip(externalServices, "Requires the deterministic public seed and disabled ads.");
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((preference) => {
        if (window.top === window) localStorage.setItem("tfg-theme", preference);
      }, theme);
      await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    });

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      test(`player fits ${viewport.width}x${viewport.height}, excludes itself from related games and makes zero Google requests`, async ({ page, googleRequests }) => {
        await page.setViewportSize(viewport);
        await page.goto("/games/tiny-quest");
        await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
        const player = page.getByRole("region", { name: "Chơi Tiny Quest", exact: true });
        await expect(player).toBeVisible();
        const box = await player.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        const frame = page.getByTitle("Chơi Tiny Quest", { exact: true });
        await expect(frame).toHaveAttribute("scrolling", "no");
        await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
        await expect(frame.contentFrame().getByRole("heading", { name: "Tiny Quest", exact: true })).toBeVisible();
        const frameBox = await frame.boundingBox();
        expect(frameBox).not.toBeNull();
        expect(frameBox!.width).toBeGreaterThan(0);
        expect(frameBox!.width / frameBox!.height).toBeCloseTo(16 / 9, 2);
        expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(box!.y + box!.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        const related = page.getByRole("complementary", { name: "Game liên quan" });
        await expect(related).toBeVisible();
        await expect(related.getByRole("link", { name: "Chơi Moon Garden", exact: true })).toBeVisible();
        await expect(related.locator('a[href="/games/tiny-quest"]')).toHaveCount(0);
        await expect(related.getByRole("link")).toHaveCount(1);
        await expect(page.getByLabel("Quảng cáo phía trên", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Quảng cáo phía dưới", { exact: true })).toBeVisible();
        await expect(page.locator(".adsbygoogle")).toHaveCount(0);
        expect(googleRequests).toEqual([]);
      });
    }

    test("fullscreen preserves the iframe element and its loaded document through enter and exit", async ({ page }) => {
      await page.goto("/games/tiny-quest");
      const player = page.getByRole("region", { name: "Chơi Tiny Quest", exact: true });
      const iframe = page.getByTitle("Chơi Tiny Quest", { exact: true });
      await expect(iframe.contentFrame().getByRole("heading", { name: "Tiny Quest", exact: true })).toBeVisible();
      const original = await iframe.elementHandle();
      expect(original).not.toBeNull();
      const frame = (await original!.contentFrame())!;
      const documentToken = randomUUID();
      await frame.evaluate((token) => { document.documentElement.dataset.acceptanceToken = token; }, documentToken);
      const navigations: string[] = [];
      page.on("framenavigated", (navigated) => {
        if (navigated.parentFrame() === page.mainFrame()) navigations.push(navigated.url());
      });
      await page.getByRole("button", { name: "Mở toàn màn hình", exact: true }).click();
      await expect.poll(() => player.evaluate((element) => document.fullscreenElement === element)).toBe(true);
      await expect(page.getByRole("button", { name: "Thoát toàn màn hình", exact: true })).toBeVisible();
      expect(await iframe.evaluate((element, first) => element === first, original)).toBe(true);
      expect(await frame.evaluate(() => document.documentElement.dataset.acceptanceToken)).toBe(documentToken);
      await page.getByRole("button", { name: "Thoát toàn màn hình", exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(page.getByRole("button", { name: "Mở toàn màn hình", exact: true })).toBeVisible();
      expect(await iframe.evaluate((element, first) => element === first, original)).toBe(true);
      expect(await frame.evaluate(() => document.documentElement.dataset.acceptanceToken)).toBe(documentToken);
      expect(navigations).toEqual([]);
      await original!.dispose();
    });

    test("a game without a cover renders the same fallback on home and discovery after reload", async ({ page }) => {
      await page.goto("/");
      const card = page.getByRole("link", { name: "Chơi Tiny Quest", exact: true });
      const fallback = card.getByTestId("game-cover-fallback");
      await expect(fallback).toBeVisible();
      await expect(fallback).toContainText("TQ");
      await expect(card.getByRole("img")).toHaveCount(0);
      const appearance = await fallback.getAttribute("style");
      await page.goto("/discover?query=Tiny%20Quest");
      await expect(fallback).toBeVisible();
      await expect(fallback).toHaveAttribute("style", appearance!);
      await page.reload();
      await expect(fallback).toBeVisible();
      await expect(fallback).toHaveAttribute("style", appearance!);
    });
  });
}

for (const route of ["register", "login"] as const) {
  test(`${route} native submission keeps credentials out of the URL without JavaScript`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
    });
    const page = await context.newPage();
    await page.goto(`/${route}`);
    await page.getByLabel("Email").fill("native-submit@example.com");
    await page.getByLabel("Mật khẩu").fill("native-password123");
    const [request] = await Promise.all([
      page.waitForRequest((request) => request.isNavigationRequest()),
      page
        .getByRole("button", {
          name: route === "register" ? "Tạo tài khoản" : "Đăng nhập",
        })
        .click(),
    ]);
    expect(request.method()).toBe("POST");
    expect(new URL(request.url()).search).toBe("");
    expect(new URL(page.url()).search).toBe("");
    expect(new URLSearchParams(request.postData() ?? "").get("password")).toBe(
      "native-password123",
    );
    await context.close();
  });
}

test("register, save a profile, create a private draft, and sign back in", async ({
  page,
  context,
}) => {
  const suffix = randomUUID();
  const email = `developer-${suffix}@example.com`;
  const title = `My first game ${suffix}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL("/studio");
  const navigation = page.getByRole("navigation", {
    name: "Điều hướng chính",
  });
  await expect(navigation.getByRole("link", { name: "Đăng nhập" })).toHaveCount(
    0,
  );
  await expect(
    navigation.getByRole("link", { name: "Hồ sơ" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Đăng xuất" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tên hiển thị")).toHaveCount(0);
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "indieforge_access",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "indieforge_access",
  );
  await navigation
    .getByRole("link", { name: "Hồ sơ" })
    .click();
  await expect(page).toHaveURL("/profile");
  await page.getByLabel("Tên hiển thị").fill("New developer");
  await page.getByLabel("Giới thiệu").fill("I make small games.");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu hồ sơ.");
  await page.reload();
  await expect(page.getByLabel("Tên hiển thị")).toHaveValue("New developer");
  await navigation.getByRole("link", { name: "Xưởng sáng tạo" }).click();
  await expect(page).toHaveURL("/studio");
  await page.getByRole("link", { name: "Tạo bản nháp" }).click();
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(`first-game-${suffix}`);
  await page.getByLabel("Mô tả").fill("A game in progress.");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await expect(page).toHaveURL("/studio");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator('[data-state="DRAFT"]')).toHaveText("Bản nháp");
  await page.getByRole("link", { name: "Khám phá", exact: true }).click();
  await page.getByLabel("Tìm kiếm game").fill(title);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(page.getByText("Chưa có game phù hợp.")).toBeVisible();
  const hidden = await page.goto(`/games/first-game-${suffix}`);
  expect(hidden?.status()).toBe(404);
  await navigation.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL("/login");
  expect(
    (await context.cookies()).some(
      (sessionCookie) => sessionCookie.name === "indieforge_access",
    ),
  ).toBe(false);
  await expect(
    navigation.getByRole("link", { name: "Đăng nhập" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Khám phá" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Xưởng sáng tạo" }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("link", { name: "Hồ sơ" }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("button", { name: "Đăng xuất" }),
  ).toHaveCount(0);
  await page.goto("/profile");
  await expect(page).toHaveURL("/login");
  await page.goto("/studio");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("wrong-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Email hoặc mật khẩu không đúng.",
  );
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL("/studio");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("public discovery and metadata render without browser JavaScript", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.E2E_EXTERNAL_SERVICES === "1",
    "Requires the deterministic public seed.",
  );
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto("/discover");
  await page.getByRole("link", { name: "Chơi Tiny Quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tiny Quest", exact: true }),
  ).toBeVisible();
  const details = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Về game này", exact: true }),
  });
  await expect(details.getByText("Bởi Minh", { exact: true })).toBeVisible();
  await context.close();
});

test("an HTML5 upload can be retried, previewed, and submitted for review", async ({
  page,
}) => {
  const suffix = randomUUID();
  const title = `HTML5 upload ${suffix}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(`upload-${suffix}@example.com`);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByRole("link", { name: "Tạo bản nháp" }).click();
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(`html5-upload-${suffix}`);
  await page.getByLabel("Cách tạo game").selectOption("UPLOAD");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();

  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/studio\/games\//);
  const archive = page.getByLabel("Tệp ZIP HTML5");
  await archive.setInputFiles({ name: "broken.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.getByRole("button", { name: "Tải game lên" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Không thể tải game lên. Vui lòng thử lại.");
  await expect(page.getByRole("button", { name: "Tải game lên" })).toBeEnabled();
  await archive.setInputFiles({
    name: "game.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      "UEsDBBQAAAAAAAAAAAAcrV6BQQAAAEEAAAAKAAAAaW5kZXguaHRtbDwhZG9jdHlwZSBodG1sPjx0aXRsZT5QcmV2aWV3IHJlYWR5PC90aXRsZT48aDE+UHJldmlldyByZWFkeTwvaDE+UEsBAhQAFAAAAAAAAAAAABytXoFBAAAAQQAAAAoAAAAAAAAAAAAAAAAAAAAAAGluZGV4Lmh0bWxQSwUGAAAAAAEAAQA4AAAAaQAAAAAA",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Tải game lên" }).click();
  const preview = page.getByTitle("Chơi thử game");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Chờ duyệt");
});

test("moderation requires a rejection note and publishes the approved artifact and private PNG cover", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!moderatorEmail || !moderatorPassword, "External moderation requires disposable moderator credentials.");
  test.setTimeout(120_000);
  const suffix = randomUUID();
  const email = `moderation-${suffix}@example.com`;
  const title = `Moderated game ${suffix}`;
  const slug = `moderated-game-${suffix}`;
  const switchAccount = async () => {
    await page.context().clearCookies();
    await page.goto("/login");
  };

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL("/studio");
  const navigation = page.getByRole("navigation", {
    name: "Điều hướng chính",
  });
  await expect(navigation.getByRole("link", { name: "Kiểm duyệt" })).toHaveCount(0);
  await page.goto("/moderation");
  await expect(page).toHaveURL("/");

  await page.goto("/studio/games/new");
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(slug);
  await page.getByLabel("Cách tạo game").selectOption("CODE");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/studio\/games\/[^/]+$/);
  const gameId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByTestId("game-cover-fallback")).toBeVisible();
  await page.getByLabel("Ảnh bìa game").setInputFiles({
    name: "tiny.png", mimeType: "image/png", buffer: tinyPng,
  });
  const [upload] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/games/${gameId}/cover`,
    ),
    page.getByRole("button", { name: "Tải ảnh bìa lên" }).click(),
  ]);
  expect(upload.status()).toBe(201);
  expect(await upload.json()).toMatchObject({ coverVersion: 1, coverContentType: "image/png" });
  const ownerCover = page.getByRole("img", { name: `Ảnh bìa ${title}`, exact: true });
  await expect(ownerCover).toHaveAttribute("src", `/api/games/${gameId}/cover/1`);
  await expectLoadedCover(ownerCover);
  await page.reload();
  await expectLoadedCover(ownerCover);
  const privateCover = await page.request.get(`/api/games/${gameId}/cover/1`);
  expect(privateCover.status()).toBe(200);
  expect(privateCover.headers()["content-type"]).toContain("image/png");
  expect(await privateCover.body()).toEqual(tinyPng);
  expect((await page.request.get(`/api/covers/${slug}/1`)).status()).toBe(404);
  const anonymous = await browser.newContext({ baseURL });
  try {
    expect((await anonymous.request.get(`/api/games/${gameId}/cover/1`)).status()).toBe(401);
    expect((await anonymous.request.get(`/api/covers/${slug}/1`)).status()).toBe(404);
    const visitor = await anonymous.newPage();
    await visitor.goto(`/discover?query=${encodeURIComponent(title)}`);
    await expect(visitor.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    expect((await visitor.goto(`/games/${slug}`))?.status()).toBe(404);
  } finally {
    await anonymous.close();
  }
  await page.getByLabel("HTML").fill(`<h1>${title}</h1>`);
  await page.getByRole("button", { name: "Lưu mã nguồn" }).click();
  await page.getByRole("button", { name: "Tạo bản chơi thử" }).click();
  await expect(
    page.getByTitle("Chơi thử game").contentFrame().getByRole("heading", {
      name: title,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Chờ duyệt");
  await switchAccount();

  await page.getByLabel("Email").fill(moderatorEmail);
  await page.getByLabel("Mật khẩu").fill(moderatorPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(navigation.getByRole("link", { name: "Kiểm duyệt" })).toBeVisible();
  await navigation.getByRole("link", { name: "Kiểm duyệt" }).click();
  await expect(page.getByTestId("moderation-queue")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
  const queued = page.getByRole("article", { name: title });
  await expect(queued.getByTitle("Chơi thử game")).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await expect(
    queued.getByTitle("Chơi thử game").contentFrame().getByRole("heading", {
      name: title,
    }),
  ).toBeVisible();
  const reject = queued.getByRole("button", { name: "Từ chối" });
  await expect(reject).toBeDisabled();
  await queued.getByLabel("Lý do từ chối").fill("Please add instructions.");
  await queued.getByLabel("Lý do từ chối").press("Tab");
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect(page.getByRole("status")).toHaveText("Đã từ chối game.");
  await expect(queued).toHaveCount(0);
  await switchAccount();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please add instructions.",
  );
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Chờ duyệt");
  await switchAccount();

  await page.getByLabel("Email").fill(moderatorEmail);
  await page.getByLabel("Mật khẩu").fill(moderatorPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await navigation.getByRole("link", { name: "Kiểm duyệt" }).click();
  await page.getByRole("article", { name: title }).getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã duyệt game.");
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const publicCover = page.getByRole("img", { name: `Ảnh bìa ${title}`, exact: true });
  await expect(publicCover).toHaveAttribute("src", `/api/covers/${slug}/1`);
  await expectLoadedCover(publicCover);
  await page.context().clearCookies();
  await page.reload();
  await expectLoadedCover(publicCover);
  const publishedCover = await page.request.get(`/api/covers/${slug}/1`);
  expect(publishedCover.status()).toBe(200);
  expect(publishedCover.headers()["content-type"]).toContain("image/png");
  expect(await publishedCover.body()).toEqual(tinyPng);
  expect((await page.request.get(`/api/games/${gameId}/cover/1`)).status()).toBe(401);
  await page.getByRole("link", { name: `Chơi ${title}`, exact: true }).click();
  await expect(page).toHaveURL(`/games/${slug}`);
  const player = page.getByTitle(`Chơi ${title}`, { exact: true });
  await expect(player).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock");
  await expect(player).toHaveAttribute("src", new RegExp(`/play/${slug}/$`));
});

test("a code game saves source, rebuilds its sandboxed preview, and submits the compiled revision", async ({
  page,
}) => {
  const suffix = randomUUID();
  const title = `Code game ${suffix}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(`code-${suffix}@example.com`);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByRole("link", { name: "Tạo bản nháp" }).click();
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(`code-game-${suffix}`);
  await page.getByLabel("Cách tạo game").selectOption("CODE");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();

  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/studio\/games\//);
  await page.getByLabel("HTML").fill(`<h1>Compiled ${suffix}</h1>`);
  await page.getByLabel("CSS").fill("h1 { color: teal; }");
  await page.getByLabel("JavaScript").fill("document.title = 'Compiled';");
  await page.getByRole("button", { name: "Lưu mã nguồn" }).click();
  await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
  await page.getByRole("button", { name: "Tạo bản chơi thử" }).click();
  const preview = page.getByTitle("Chơi thử game");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await expect(preview).toHaveAttribute("src", /\?v=1$/);
  await expect(
    preview.contentFrame().getByRole("heading", { name: `Compiled ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeEnabled();
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByRole("status")).toHaveText("Chờ duyệt");
});

test("a story game builds a sandboxed branching preview that reaches the selected scene", async ({
  page,
}) => {
  const suffix = randomUUID();
  const title = `Story game ${suffix}`;
  const openingSpeaker = `Guide ${suffix}`;
  const endingSpeaker = `Treasure ${suffix}`;
  const choice = "Open the hidden door";
  await page.goto("/register");
  await page.getByLabel("Email").fill(`story-${suffix}@example.com`);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByRole("link", { name: "Tạo bản nháp" }).click();
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(`story-game-${suffix}`);
  await page.getByLabel("Cách tạo game").selectOption("STORY");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();

  await page.getByRole("link", { name: title }).click();
  const opening = page.getByRole("group", { name: "Cảnh 1" });
  await opening.getByLabel("Người nói").fill(openingSpeaker);
  await opening.getByLabel("Lời thoại").fill("A door waits in the dark.");
  await page.getByRole("button", { name: "Thêm cảnh" }).click();
  const ending = page.getByRole("group", { name: "Cảnh 2" });
  await ending.getByLabel("Mã cảnh").fill("treasure");
  await ending.getByLabel("Người nói").fill(endingSpeaker);
  await ending.getByLabel("Lời thoại").fill("You found the treasure.");
  await opening.getByRole("button", { name: "Thêm lựa chọn" }).click();
  await opening.getByLabel("Nội dung lựa chọn").fill(choice);
  await opening.getByLabel("Mã cảnh đích").fill("treasure");
  await page.getByRole("button", { name: "Lưu cốt truyện" }).click();
  await page.getByRole("button", { name: "Tạo bản chơi thử" }).click();

  const preview = page.getByTitle("Chơi thử game");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  const game = preview.contentFrame();
  await expect(game.getByRole("heading", { name: openingSpeaker })).toBeVisible();
  await game.getByRole("button", { name: choice }).click();
  await expect(game.getByRole("heading", { name: endingSpeaker })).toBeVisible();
});

test("a platformer game builds a collision-safe preview that reaches its goal by keyboard", async ({
  page,
}) => {
  const suffix = randomUUID();
  const title = `Platformer game ${suffix}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(`platformer-${suffix}@example.com`);
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByRole("link", { name: "Tạo bản nháp" }).click();
  await page.getByLabel("Tên game").fill(title);
  await page.getByLabel("Đường dẫn").fill(`platformer-game-${suffix}`);
  await page.getByLabel("Cách tạo game").selectOption("PLATFORMER");
  await page.getByRole("button", { name: "Tạo bản nháp" }).click();

  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("Vị trí X đích đến").fill("205");
  await page.getByLabel("Vị trí Y đích đến").fill("316");
  await page.getByRole("button", { name: "Thêm nền tảng" }).click();
  const elevated = page.getByRole("group", { name: "Nền tảng 2" });
  await elevated.getByLabel("X").fill("130");
  await elevated.getByLabel("Y").fill("340");
  await elevated.getByLabel("Chiều rộng").fill("240");
  await elevated.getByLabel("Chiều cao").fill("20");
  await page.getByRole("button", { name: "Lưu game đi cảnh" }).click();
  await page.getByRole("button", { name: "Tạo bản chơi thử" }).click();

  const preview = page.getByTitle("Chơi thử game");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  const game = preview.contentFrame();
  const canvas = game.locator("#game");
  await expect.poll(async () =>
    canvas.evaluate((element) => {
      const context = (element as HTMLCanvasElement).getContext("2d");
      return context
        ? Array.from(context.getImageData(36, 428, 1, 1).data)
        : [];
    }),
  ).toEqual([37, 99, 235, 255]);

  await canvas.click();
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () =>
    Number(await canvas.getAttribute("data-player-x")),
  ).toBeGreaterThanOrEqual(70);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => Number(await canvas.getAttribute("data-player-y"))).toBeLessThan(390);
  await expect(game.getByRole("status")).toHaveText("Goal reached!");
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("r");
  await expect(game.getByRole("status")).toHaveText("");
  await expect.poll(async () =>
    canvas.evaluate((element) => {
      const context = (element as HTMLCanvasElement).getContext("2d");
      return context ? Array.from(context.getImageData(36, 428, 1, 1).data) : [];
    }),
  ).toEqual([37, 99, 235, 255]);
});
