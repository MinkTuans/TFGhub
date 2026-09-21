import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("ships a self-contained Flappy Bird archive source with touch, keyboard, restart, and score reporting", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../../../assets/games/flappy-bird/index.html"),
    "utf8",
  );

  expect(source).toContain("<canvas");
  expect(source).toContain("keydown");
  expect(source).toContain("pointerdown");
  expect(source).toContain("Restart");
  expect(source).toContain("tfg:score");
});
