import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "indieforge_access",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "indieforge_access",
  );
  await page.getByLabel("Display name").fill("New developer");
  await page.getByLabel("Bio").fill("I make small games.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("New developer");
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
  await context.clearCookies();
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
