import { notFound } from "next/navigation";
import type { DiscoverGamesResponse, PublicGameSummary } from "@indieforge/contracts";
import { api, ApiError, resolvePublicApiBaseUrl } from "../../../lib/api-client";
import { AdSlot } from "../../../components/ad-slot";
import { GamePlayer } from "../../../components/game-player";
import { RelatedGames } from "../../../components/related-games";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const relatedRequest = api.get<DiscoverGamesResponse>("/discover?limit=7").catch(() => null);
  let game: PublicGameSummary;
  try {
    game = await api.get<PublicGameSummary>(
      `/games/by-slug/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const related = await relatedRequest;
  return (
    <main className="game-page">
      <div className="game-page__layout">
        <aside className="game-page__ads" aria-label="Quảng cáo">
          <AdSlot slot="gameLeftTop" label="Quảng cáo phía trên" />
          <AdSlot slot="gameLeftBottom" label="Quảng cáo phía dưới" />
        </aside>
        {game.artifactReady && game.artifactVersion > 0 ? (
          <GamePlayer
            title={game.title}
            src={`${resolvePublicApiBaseUrl()}/play/${encodeURIComponent(game.slug)}/`}
            viewportWidth={game.viewportWidth}
            viewportHeight={game.viewportHeight}
          />
        ) : (
          <section className="game-page__unavailable">
            <h1>{game.title}</h1>
            <p>Game chưa sẵn sàng để chơi.</p>
          </section>
        )}
        <RelatedGames games={related?.games ?? []} currentSlug={game.slug} />
      </div>
      <article className="game-page__details">
        <h2>Về game này</h2>
        <p>Bởi {game.developer.displayName}</p>
        <p className="description">{game.description}</p>
      </article>
    </main>
  );
}
