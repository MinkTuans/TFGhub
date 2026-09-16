import Link from "next/link";
import type { GameSummary } from "@indieforge/contracts";
import { privateGet } from "../../lib/session";
import { StudioGameList } from "../../components/studio-game-list";

const reviewLabels = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
} as const;

export default async function StudioPage() {
  const games = await privateGet<GameSummary[]>("/games/mine");
  const counts = { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const game of games) counts[game.reviewState] += 1;
  return (
    <main className="studio-dashboard">
      <header className="page-heading">
        <p className="eyebrow">Chào mừng bạn đến với Studio.</p>
        <h1>Studio của bạn</h1>
      </header>
      <p>Nơi quản lý, sáng tạo và đưa game của bạn đến với người chơi.</p>
      <section aria-label="Thống kê game">
        <dl className="studio-summary">
          {(Object.keys(reviewLabels) as Array<keyof typeof reviewLabels>).map((state) => (
            <div className="panel" key={state}>
              <dt>{reviewLabels[state]}</dt>
              <dd>{counts[state]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="games-heading">
        <div className="section-heading">
          <h2 id="games-heading">Game của bạn</h2>
          <Link className="button" href="/studio/games/new">
            Tạo game
          </Link>
        </div>
        <StudioGameList games={games.map(({ id, slug, title, description, visibility, reviewState, updatedAt, coverVersion, coverContentType }) => ({ id, slug, title, description, visibility, reviewState, updatedAt, coverVersion, coverContentType }))} />
      </section>
    </main>
  );
}
