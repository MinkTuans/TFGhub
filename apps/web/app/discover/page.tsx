import Link from "next/link";
import type { DiscoverGamesResponse } from "@indieforge/contracts";
import { DiscoverSearch } from "../../components/discover-search";
import { EmptyState } from "../../components/empty-state";
import { GameCard } from "../../components/game-card";
import { api, ApiError } from "../../lib/api-client";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : "";
  const search = new URLSearchParams();
  if (query) search.set("query", query);
  if (typeof params.cursor === "string") search.set("cursor", params.cursor);
  let data: DiscoverGamesResponse | undefined;
  let error = "";
  try {
    data = await api.get<DiscoverGamesResponse>(`/discover?${search}`);
  } catch (failure) {
    error =
      failure instanceof ApiError && failure.status === 400
        ? "Từ khóa tìm kiếm không hợp lệ. Hãy thử lại."
        : "Không thể tải trò chơi lúc này. Vui lòng thử lại.";
  }
  const next = new URLSearchParams();
  if (query) next.set("query", query);
  if (data?.nextCursor) next.set("cursor", data.nextCursor);
  return (
    <main className="discover-page">
      <p className="eyebrow">Từ cộng đồng TFG</p>
      <h1>Khám phá trò chơi</h1>
      <p className="discover-page__lede">
        Những trò chơi nhỏ, ý tưởng mới và những người tạo ra chúng.
      </p>
      <DiscoverSearch key={query} query={query} />
      {error && (
        <div className="discover-state" role="alert">
          <p>{error}</p>
          <Link href={query ? `/discover?query=${encodeURIComponent(query)}` : "/discover"}>
            Thử lại
          </Link>
        </div>
      )}
      {data && (
        <section className="catalog-results" aria-label="Kết quả khám phá">
          <div className="catalog-results__heading">
            <div>
              <h2>{query ? `Kết quả cho “${query}”` : "Trò chơi mới nhất"}</h2>
              <p>{data.games.length} trò chơi trong trang này</p>
            </div>
            <span className="badge">Chơi trên trình duyệt</span>
          </div>
          {data.games.length === 0 ? (
            <EmptyState title="Chưa có trò chơi phù hợp." description="Thử một từ khóa khác, hoặc xem tất cả trò chơi đang có trên TFG.">
              <Link href="/discover">Xem tất cả trò chơi</Link>
            </EmptyState>
          ) : (
            <div className="grid catalog-grid">
              {data.games.map((game) => <GameCard key={game.slug} game={game} />)}
            </div>
          )}
        </section>
      )}
      {data?.nextCursor && (
        <nav className="catalog-pagination" aria-label="Phân trang trò chơi">
          <Link className="button button-ghost" href={`/discover?${next}`}>Trang tiếp theo</Link>
        </nav>
      )}
    </main>
  );
}
