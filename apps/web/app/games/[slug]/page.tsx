import Link from "next/link";
import { GameCover } from "../../../components/game-cover";
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
      <header className="game-showcase">
        <Link className="game-showcase__back" href="/discover">← Trở về khám phá</Link>
        <div className="game-showcase__banner">
          <GameCover game={game} priority />
          <div className="game-showcase__caption"><span className="badge">Trò chơi độc lập · Trình duyệt</span><p className="game-showcase__title">{game.title}</p><p>Bởi {game.developer.displayName}</p><a href="#play-game" className="button">Chơi ngay <span aria-hidden="true">→</span></a></div>
        </div>
      </header>
      <div className="game-page__layout" id="play-game">
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
            <p>Trò chơi chưa sẵn sàng để chơi.</p>
          </section>
        )}
        <RelatedGames games={related?.games ?? []} currentSlug={game.slug} />
      </div>
      <article className="game-page__details game-details">
        <div className="game-details__about">
          <div className="game-details__cover"><GameCover game={game} /></div>
          <div>
            <p className="eyebrow">Được tạo bởi cộng đồng TFG</p>
            <h2>Về trò chơi này</h2>
            <p className="game-card__developer">Bởi {game.developer.displayName}</p>
            <p className="description">{game.description || "Nhà sáng tạo chưa thêm mô tả cho trò chơi này."}</p>
            <Link href="/discover">Khám phá thêm trò chơi</Link>
          </div>
        </div>
        <aside className="game-details__info" aria-labelledby="game-info-title">
          <h2 id="game-info-title">Thông tin trò chơi</h2>
          <dl>
            <div><dt>Nền tảng</dt><dd>Trình duyệt</dd></div>
            <div><dt>Ngày tạo</dt><dd><time dateTime={game.createdAt}>{new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(game.createdAt))}</time></dd></div>
            <div><dt>Bản chơi</dt><dd>{game.artifactReady && game.artifactVersion > 0 ? `Bản dựng #${game.artifactVersion}` : "Chưa sẵn sàng"}</dd></div>
          </dl>
        </aside>
      </article>
    </main>
  );
}
