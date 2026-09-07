import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const externalServices = process.env.E2E_EXTERNAL_SERVICES === "1";
const moderatorEmail = process.env.E2E_MODERATOR_EMAIL ?? (externalServices ? "" : "moderator@example.com");
const moderatorPassword = process.env.E2E_MODERATOR_PASSWORD ?? (externalServices ? "" : "moderator-password123");

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

test("an HTML5 upload can be retried, previewed, and submitted for review", async ({
  page,
}) => {
  const suffix = randomUUID();
  const title = `HTML5 upload ${suffix}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(`upload-${suffix}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Create a draft" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(`html5-upload-${suffix}`);
  await page.getByLabel("Source type").selectOption("UPLOAD");
  await page.getByRole("button", { name: "Create draft" }).click();

  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/studio\/games\//);
  const archive = page.getByLabel("HTML5 ZIP archive");
  await archive.setInputFiles({ name: "broken.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.getByRole("button", { name: "Upload game" }).click();
  await expect(page.getByText(/End of central directory/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload game" })).toBeEnabled();
  await archive.setInputFiles({
    name: "game.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      "UEsDBBQAAAAAAAAAAAAcrV6BQQAAAEEAAAAKAAAAaW5kZXguaHRtbDwhZG9jdHlwZSBodG1sPjx0aXRsZT5QcmV2aWV3IHJlYWR5PC90aXRsZT48aDE+UHJldmlldyByZWFkeTwvaDE+UEsBAhQAFAAAAAAAAAAAABytXoFBAAAAQQAAAAoAAAAAAAAAAAAAAAAAAAAAAGluZGV4Lmh0bWxQSwUGAAAAAAEAAQA4AAAAaQAAAAAA",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Upload game" }).click();
  const preview = page.getByTitle("Game preview");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toHaveText("Pending review");
});

test("moderation hides from regular users, requires a rejection note, and publishes approved artifacts", async ({
  page,
}) => {
  test.skip(!moderatorEmail || !moderatorPassword, "External moderation requires disposable moderator credentials.");
  test.setTimeout(120_000);
  const suffix = randomUUID();
  const email = `moderation-${suffix}@example.com`;
  const title = `Moderated game ${suffix}`;
  const slug = `moderated-game-${suffix}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
  });
  await expect(navigation.getByRole("link", { name: "Moderation" })).toHaveCount(0);
  await page.goto("/moderation");
  await expect(page).toHaveURL("/");

  await page.goto("/studio/games/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Source type").selectOption("CODE");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("HTML").fill(`<h1>${title}</h1>`);
  await page.getByRole("button", { name: "Save source" }).click();
  await page.getByRole("button", { name: "Build preview" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toHaveText("Pending review");
  await navigation.getByRole("button", { name: "Đăng xuất" }).click();

  await page.getByLabel("Email").fill(moderatorEmail);
  await page.getByLabel("Password").fill(moderatorPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(navigation.getByRole("link", { name: "Moderation" })).toBeVisible();
  await navigation.getByRole("link", { name: "Moderation" }).click();
  await expect(page.getByTestId("moderation-queue")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
  const queued = page.getByRole("article", { name: title });
  await expect(queued.getByTitle("Game preview")).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await expect(
    queued.getByTitle("Game preview").contentFrame().getByRole("heading", {
      name: title,
    }),
  ).toBeVisible();
  const reject = queued.getByRole("button", { name: "Reject" });
  await expect(reject).toBeDisabled();
  await queued.getByLabel("Rejection note").fill("Please add instructions.");
  await queued.getByLabel("Rejection note").press("Tab");
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect(page.getByRole("status")).toHaveText("Game rejected.");
  await expect(queued).toHaveCount(0);
  await navigation.getByRole("button", { name: "Đăng xuất" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please add instructions.",
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await navigation.getByRole("button", { name: "Đăng xuất" }).click();

  await page.getByLabel("Email").fill(moderatorEmail);
  await page.getByLabel("Password").fill(moderatorPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await navigation.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("article", { name: title }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toHaveText("Game approved.");
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  const player = page.getByTitle("Game player");
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
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Create a draft" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(`code-game-${suffix}`);
  await page.getByLabel("Source type").selectOption("CODE");
  await page.getByRole("button", { name: "Create draft" }).click();

  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/studio\/games\//);
  await page.getByLabel("HTML").fill(`<h1>Compiled ${suffix}</h1>`);
  await page.getByLabel("CSS").fill("h1 { color: teal; }");
  await page.getByLabel("JavaScript").fill("document.title = 'Compiled';");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await page.getByRole("button", { name: "Build preview" }).click();
  const preview = page.getByTitle("Game preview");
  await expect(preview).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-pointer-lock",
  );
  await expect(preview).toHaveAttribute("src", /\?v=1$/);
  await expect(
    preview.contentFrame().getByRole("heading", { name: `Compiled ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toHaveText("Pending review");
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
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Create a draft" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(`story-game-${suffix}`);
  await page.getByLabel("Source type").selectOption("STORY");
  await page.getByRole("button", { name: "Create draft" }).click();

  await page.getByRole("link", { name: title }).click();
  const opening = page.getByRole("group", { name: "Scene 1" });
  await opening.getByLabel("Speaker").fill(openingSpeaker);
  await opening.getByLabel("Dialogue").fill("A door waits in the dark.");
  await page.getByRole("button", { name: "Add scene" }).click();
  const ending = page.getByRole("group", { name: "Scene 2" });
  await ending.getByLabel("Scene ID").fill("treasure");
  await ending.getByLabel("Speaker").fill(endingSpeaker);
  await ending.getByLabel("Dialogue").fill("You found the treasure.");
  await opening.getByRole("button", { name: "Add choice" }).click();
  await opening.getByLabel("Choice text").fill(choice);
  await opening.getByLabel("Target scene ID").fill("treasure");
  await page.getByRole("button", { name: "Save story" }).click();
  await page.getByRole("button", { name: "Build preview" }).click();

  const preview = page.getByTitle("Game preview");
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
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Create a draft" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Slug").fill(`platformer-game-${suffix}`);
  await page.getByLabel("Source type").selectOption("PLATFORMER");
  await page.getByRole("button", { name: "Create draft" }).click();

  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("Goal X").fill("205");
  await page.getByLabel("Goal Y").fill("316");
  await page.getByRole("button", { name: "Add platform" }).click();
  const elevated = page.getByRole("group", { name: "Platform 2" });
  await elevated.getByLabel("X").fill("130");
  await elevated.getByLabel("Y").fill("340");
  await elevated.getByLabel("Width").fill("240");
  await elevated.getByLabel("Height").fill("20");
  await page.getByRole("button", { name: "Save platformer" }).click();
  await page.getByRole("button", { name: "Build preview" }).click();

  const preview = page.getByTitle("Game preview");
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
  await page.waitForTimeout(200);
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
