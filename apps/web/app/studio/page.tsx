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
      <aside className="creator-sidebar">
        <div className="creator-sidebar__identity">
          <span className="profile-avatar" aria-hidden="true">TFG</span>
          <strong>Không gian của bạn</strong>
          <span className="hint">Nhà sáng tạo trò chơi</span>
          <Link href="/profile">Chỉnh sửa hồ sơ</Link>
        </div>
        <nav aria-label="Không gian sáng tạo">
          <Link href="/studio" aria-current="page"><span aria-hidden="true">▦</span> Tổng quan</Link>
          <Link href="#games-heading"><span aria-hidden="true">◈</span> Trò chơi của bạn</Link>
          <Link href="/profile"><span aria-hidden="true">◎</span> Hồ sơ của bạn</Link>
          <Link href="/discover"><span aria-hidden="true">⌕</span> Khám phá</Link>
        </nav>
        <p className="creator-sidebar__note">Một ý tưởng nhỏ.<br />Một thế giới của riêng bạn.</p>
      </aside>
      <header className="page-heading">
        <p className="eyebrow">Chào mừng bạn đến với Xưởng sáng tạo.</p>
        <h1>Xưởng sáng tạo của bạn</h1>
      <p>Nơi quản lý, sáng tạo và đưa trò chơi của bạn đến với người chơi.</p>
      </header>
      <section aria-label="Thống kê trò chơi">
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
          <h2 id="games-heading">Trò chơi của bạn</h2>
          <Link className="button" href="/studio/games/new">
            Tạo trò chơi
          </Link>
        </div>
        <StudioGameList games={games.map(({ id, slug, title, description, visibility, reviewState, updatedAt, coverVersion, coverContentType }) => ({ id, slug, title, description, visibility, reviewState, updatedAt, coverVersion, coverContentType }))} />
      </section>
    </main>
  );
}
