import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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
    await page.getByLabel("Password").fill("native-password123");
    const [request] = await Promise.all([
      page.waitForRequest((request) => request.isNavigationRequest()),
      page
        .getByRole("button", {
          name: route === "register" ? "Create account" : "Log in",
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
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/studio");
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
  });
  await expect(navigation.getByRole("link", { name: "Log in" })).toHaveCount(
    0,
  );
  await expect(
    navigation.getByRole("link", { name: "Thông tin cá nhân" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Đăng xuất" }),
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveCount(0);
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "indieforge_access",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "indieforge_access",
  );
  await navigation
    .getByRole("link", { name: "Thông tin cá nhân" })
    .click();
  await expect(page).toHaveURL("/profile");
  await page.getByLabel("Display name").fill("New developer");
  await page.getByLabel("Bio").fill("I make small games.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("New developer");
  await navigation.getByRole("link", { name: "Studio" }).click();
  await expect(page).toHaveURL("/studio");
  await page.getByRole("link", { name: "Create a draft" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(`first-game-${suffix}`);
  await page.getByLabel("Description").fill("A game in progress.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL("/studio");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await page.getByLabel("Search games").fill(title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(page.getByText("No games found.")).toBeVisible();
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
    navigation.getByRole("link", { name: "Log in" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Discover" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Studio" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Thông tin cá nhân" }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("button", { name: "Đăng xuất" }),
  ).toHaveCount(0);
  await page.goto("/profile");
  await expect(page).toHaveURL("/login");
  await page.goto("/studio");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Invalid email or password",
  );
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
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
  await page.getByRole("link", { name: "Tiny Quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tiny Quest", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("By Minh")).toBeVisible();
  await context.close();
});
