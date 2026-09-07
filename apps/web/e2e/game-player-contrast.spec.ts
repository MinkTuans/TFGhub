import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
  .replace('@import "tailwindcss";', "");

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

for (const theme of ["light", "dark"]) {
  test(`fullscreen player title, control and error have readable contrast in ${theme} theme`, async ({ page }) => {
    // A small CSS fixture isolates the production stylesheet's native fullscreen cascade.
    await page.setContent(`<html data-theme="${theme}"><head><style>${styles}</style></head><body>
      <section class="game-player">
        <div class="game-player__toolbar"><h1>Tiny Quest</h1><button>Mở toàn màn hình</button></div>
        <p class="game-player__error" role="status">Không thể mở toàn màn hình trên trình duyệt này.</p>
      </section>
    </body></html>`);
    await page.getByRole("button").evaluate((button) => {
      button.addEventListener("click", () => button.closest("section")!.requestFullscreen());
    });
    await page.getByRole("button").click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    const colors = await page.evaluate(() => {
      const heading = getComputedStyle(document.querySelector(".game-player h1")!);
      const button = getComputedStyle(document.querySelector(".game-player button")!);
      const player = getComputedStyle(document.querySelector(".game-player")!);
      const error = getComputedStyle(document.querySelector(".game-player__error")!);
      return { heading: heading.color, background: player.backgroundColor, buttonText: button.color, buttonBackground: button.backgroundColor, errorText: error.color, errorBackground: error.backgroundColor };
    });
    expect(contrast(colors.heading, colors.background), `Title contrast: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.buttonText, colors.buttonBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.errorText, colors.errorBackground)).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => document.exitFullscreen());
  });
}
