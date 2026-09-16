import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GameCover, coverHue } from "../components/game-cover";
import { GameCard } from "../components/game-card";
import { RelatedGames } from "../components/related-games";

const globalStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_URL", "/api"));
afterEach(() => vi.unstubAllEnvs());

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

test("excludes the current game before limiting related games to six compact cards", () => {
  const games = [tinyQuest, ...Array.from({ length: 8 }, (_, index) => ({ ...tinyQuest, slug: `related-${index}`, title: `Related ${index}` }))];
  render(<RelatedGames games={games} currentSlug="tiny-quest" />);
  expect(screen.queryByRole("link", { name: /Tiny Quest/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(6);
  expect(screen.getByRole("link", { name: /Related 5/ })).toBeVisible();
  expect(screen.queryByRole("link", { name: /Related 6/ })).not.toBeInTheDocument();
  expect(screen.queryByText("A demo")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Trò chơi liên quan" })).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
});

test("omits the related heading when there are no other games", () => {
  render(<RelatedGames games={[tinyQuest]} currentSlug="tiny-quest" />);
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
});

test("links the complete public game card and shows its versioned cover", () => {
  render(
    <GameCard
      game={tinyQuest}
    />,
  );
  expect(screen.getByRole("link", { name: "Chơi Tiny Quest" })).toHaveAttribute(
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

test.each([
  ["/api/", "/api"],
  ["https://public.example/api/", "https://public.example/api"],
])("cover display honors public API base %s for public and owner routes", (configured, base) => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", configured);
  vi.stubEnv("API_INTERNAL_URL", "http://private-api:3001");
  const { rerender } = render(<GameCover game={tinyQuest} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", `${base}/covers/tiny-quest/2`);
  rerender(<GameCover game={tinyQuest} ownerGameId="game/42" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", `${base}/games/game%2F42/cover/2`);
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

test("contains long unbroken card titles and developer names", () => {
  const title = "T".repeat(80);
  const developer = "D".repeat(80);
  render(<GameCard game={{ ...tinyQuest, title, developer: { displayName: developer } }} compact />);

  expect(screen.getByRole("heading", { name: title })).toBeVisible();
  expect(screen.getByText(`Bởi ${developer}`)).toBeVisible();
  expect(globalStyles).toMatch(
    /\.game-card__body \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/,
  );
  expect(globalStyles).toMatch(
    /\.game-card--compact article \{[\s\S]*?min-width: 0;/,
  );
});

test("uses compact fallback dimensions for compact game cards", () => {
  render(
    <GameCard
      compact
      game={{ ...tinyQuest, coverVersion: 0, coverContentType: null }}
    />,
  );

  expect(screen.getByTestId("game-cover-fallback")).toHaveTextContent("TQ");
  expect(globalStyles).toMatch(
    /\.game-card--compact \.game-cover__fallback \{[\s\S]*?padding: 0\.5rem;/,
  );
  expect(globalStyles).toMatch(
    /\.game-card--compact \.game-cover__fallback strong \{[\s\S]*?font-size: 1\.5rem;[\s\S]*?line-height: 1;/,
  );
});
