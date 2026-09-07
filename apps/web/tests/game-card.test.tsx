import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GameCover, coverHue } from "../components/game-cover";
import { GameCard } from "../components/game-card";

const tinyQuest = {
  slug: "tiny-quest",
  title: "Tiny Quest",
  description: "A demo",
  developer: { displayName: "Minh" },
  artifactVersion: 1,
  artifactReady: true,
  coverVersion: 2,
  coverContentType: "image/webp" as const,
  viewportWidth: 16,
  viewportHeight: 9,
};

test("links the complete public game card and shows its versioned cover", () => {
  render(
    <GameCard
      game={tinyQuest}
    />,
  );
  expect(screen.getByRole("link", { name: /tiny quest/i })).toHaveAttribute(
    "href",
    "/games/tiny-quest",
  );
  expect(screen.getByRole("img", { name: "Ảnh bìa Tiny Quest" })).toHaveAttribute(
    "src",
    expect.stringContaining("/api/covers/tiny-quest/2"),
  );
  expect(screen.getByText(/minh/i)).toBeVisible();
  expect(screen.getByText("A demo")).toBeVisible();
});

test("encodes public cover slugs and uses the owner route when supplied", () => {
  const { rerender } = render(
    <GameCover game={{ ...tinyQuest, slug: "tiny quest/đặc biệt" }} />,
  );

  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("/api/covers/tiny%20quest%2F%C4%91%E1%BA%B7c%20bi%E1%BB%87t/2"),
  );

  rerender(<GameCover game={tinyQuest} ownerGameId="game/42" />);

  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("/api/games/game%2F42/cover/2"),
  );
});

test("keeps a 16:9 TFG fallback for games without a cover", () => {
  render(<GameCover game={{ ...tinyQuest, coverVersion: 0, coverContentType: null }} />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByTestId("game-cover-fallback")).toHaveTextContent("TQ");
  expect(screen.getByTestId("game-cover-fallback")).toHaveStyle({
    aspectRatio: "16 / 9",
  });
});

test("derives a stable fallback hue from the game slug", () => {
  expect(coverHue("tiny-quest")).toBe(coverHue("tiny-quest"));
  expect(coverHue("tiny-quest")).not.toBe(coverHue("sky-arcade"));
});
