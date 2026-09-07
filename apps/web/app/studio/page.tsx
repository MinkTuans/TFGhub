import Link from "next/link";
import type { GameSummary } from "@indieforge/contracts";
import { privateGet } from "../../lib/session";
import { GameCover } from "../../components/game-cover";

export default async function StudioPage() {
  const games = await privateGet<GameSummary[]>("/games/mine");
  return (
    <main>
      <header className="page-heading">
        <h1>Studio của bạn</h1>
      </header>
      <p>Nơi quản lý, sáng tạo và đưa game của bạn đến với người chơi.</p>
      <section aria-labelledby="games-heading">
        <div className="section-heading">
          <h2 id="games-heading">Game của bạn</h2>
          <Link className="button" href="/studio/games/new">
            Tạo bản nháp
          </Link>
        </div>
        {games.length === 0 ? (
          <p>Bạn chưa có bản nháp. Bắt đầu với một ý tưởng và tên game.</p>
        ) : (
          <div className="grid">
            {games.map((game) => (
              <article className="card studio-card" key={game.id}>
                <GameCover game={game} ownerGameId={game.id} />
                <div className="studio-card__body">
                  <h3>
                    <Link href={`/studio/games/${game.id}`}>{game.title}</Link>
                  </h3>
                  <p className="badge">
                    {game.visibility === "DRAFT"
                      ? "Bản nháp"
                      : game.visibility === "PUBLIC"
                        ? "Công khai"
                        : "Không niêm yết"}
                  </p>
                  <p className="badge" data-state={game.reviewState}>
                    {
                      {
                        DRAFT: "Bản nháp",
                        PENDING: "Chờ duyệt",
                        APPROVED: "Đã duyệt",
                        REJECTED: "Bị từ chối",
                      }[game.reviewState]
                    }
                  </p>
                  <p className="description">{game.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
