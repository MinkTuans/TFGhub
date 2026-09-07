import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GameCard } from "../components/game-card";

test("links to public game metadata and credits its developer", () => {
  render(
    <GameCard
      game={{
        slug: "tiny-quest",
        title: "Tiny Quest",
        description: "A demo",
        developer: { displayName: "Minh" },
        artifactVersion: 1,
        artifactReady: true,
        coverVersion: 0,
        coverContentType: null,
        viewportWidth: 16,
        viewportHeight: 9,
      }}
    />,
  );
  expect(screen.getByRole("link", { name: /tiny quest/i })).toHaveAttribute(
    "href",
    "/games/tiny-quest",
  );
  expect(screen.getByText(/minh/i)).toBeVisible();
  expect(screen.getByText("A demo")).toBeVisible();
});
