import Link from "next/link";
import type { PublicGameSummary } from "@indieforge/contracts";

export function GameCard({
  game,
}: {
  game: Omit<PublicGameSummary, "createdAt">;
}) {
  return (
    <article className="card">
      <h2>
        <Link href={`/games/${encodeURIComponent(game.slug)}`}>
          {game.title}
        </Link>
      </h2>
      <p>By {game.developer.displayName}</p>
      <p className="description">{game.description}</p>
    </article>
  );
}
