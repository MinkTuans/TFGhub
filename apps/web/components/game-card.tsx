import Link from "next/link";
import type { PublicGameSummary } from "@indieforge/contracts";
import { GameCover } from "./game-cover";

export function GameCard({
  game,
  compact = false,
  headingLevel = 2,
}: {
  game: Omit<PublicGameSummary, "createdAt">;
  compact?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <Link
      aria-label={`Chơi ${game.title}`}
      className={`game-card${compact ? " game-card--compact" : ""}`}
      href={`/games/${encodeURIComponent(game.slug)}`}
    >
      <article>
        <div className="game-card__artwork">
          <GameCover game={game} size={compact ? "compact" : "card"} />
          {!compact && <span className="game-card__action" aria-hidden="true">Xem game →</span>}
        </div>
        <div className="game-card__body">
          <Heading className="game-card__title">{game.title}</Heading>
          <p className="game-card__developer">Bởi {game.developer.displayName}</p>
          {!compact && <p className="description">{game.description}</p>}
        </div>
      </article>
    </Link>
  );
}
