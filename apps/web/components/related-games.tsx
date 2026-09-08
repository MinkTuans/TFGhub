import type { PublicGameSummary } from "@indieforge/contracts";
import { GameCard } from "./game-card";

export function RelatedGames({ games, currentSlug }: {
  games: Omit<PublicGameSummary, "createdAt">[];
  currentSlug: string;
}) {
  const related = games.filter((game) => game.slug !== currentSlug).slice(0, 6);
  if (related.length === 0) return null;

  return (
    <aside className="related-games" aria-labelledby="related-games-heading">
      <h2 id="related-games-heading">Game liên quan</h2>
      <div className="related-games__list">
        {related.map((game) => <GameCard key={game.slug} game={game} compact headingLevel={3} />)}
      </div>
    </aside>
  );
}
