import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = ["globals.css", "reference-world.css"].map(name =>
  readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8").replace(/@import[^;]+;/g, ""),
).join("\n");

// Isolate the production stylesheet; component tests cover the iframe sandbox/scroll contract.
async function playerPage(page: import("@playwright/test").Page) {
  await page.setContent(`<style>${styles}</style><main class="game-page"><div class="game-page__layout">
    <section class="game-player"><div class="game-player__toolbar"><h1>Mobile game</h1><button>Fullscreen</button></div>
      <div class="game-player__stage"><div class="game-player__fit" style="--player-ratio:1"><iframe title="Mobile game" sandbox="allow-scripts allow-pointer-lock"></iframe></div></div>
    </section></div></main>`);
  await page.locator("iframe").evaluate(frame => {
    frame.srcdoc = `<style>body{margin:0}button{height:48px;width:100%}</style><div style="height:900px">Instructions and board</div><button onclick="this.textContent='Played'">Play</button>`;
  });
  await expect(page.frameLocator("iframe").getByRole("button")).toBeAttached();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`phone game fills its stage and scrolls to controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await playerPage(page);
    const stage = await page.locator(".game-player__stage").boundingBox();
    const frame = await page.locator("iframe").boundingBox();
    expect(frame!.width).toBeCloseTo(stage!.width, 0);
    expect(frame!.height).toBeCloseTo(stage!.height, 0);
    expect(frame!.height, "Short screens retain room for the board and touch controls").toBeGreaterThan(420);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.locator("iframe").hover();
    await page.mouse.wheel(0, 1600);
    const button = page.frameLocator("iframe").getByRole("button");
    await expect.poll(() => button.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // On a short landscape screen the page also scrolls around the usable-height player.
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    await button.click();
    await expect(button).toHaveText("Played");
  });
}

test("desktop retains the declared aspect ratio and rotation refits without replacing the frame", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await playerPage(page);
  const original = await page.locator("iframe").elementHandle();
  const desktop = await page.locator("iframe").boundingBox();
  expect(desktop!.width / desktop!.height).toBeCloseTo(1, 2);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const stage = await page.locator(".game-player__stage").boundingBox();
      const frame = await page.locator("iframe").boundingBox();
      return Math.abs(stage!.height - frame!.height);
    }).toBeLessThan(1);
    expect(await page.locator("iframe").evaluate((node, previous) => node === previous, original)).toBe(true);
  }
});
