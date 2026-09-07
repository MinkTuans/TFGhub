import Link from "next/link";
import type { PublicGameSummary } from "@indieforge/contracts";
import { GameCover } from "./game-cover";

export function GameCard({
  game,
  compact = false,
}: {
  game: Omit<PublicGameSummary, "createdAt">;
  compact?: boolean;
}) {
  return (
    <Link
      className={`game-card${compact ? " game-card--compact" : ""}`}
      href={`/games/${encodeURIComponent(game.slug)}`}
    >
      <article>
        <GameCover game={game} size={compact ? "compact" : "card"} />
        <div className="game-card__body">
          <h2>
          {game.title}
          </h2>
          <p className="game-card__developer">Bởi {game.developer.displayName}</p>
          {!compact && <p className="description">{game.description}</p>}
        </div>
      </article>
    </Link>
  );
}
