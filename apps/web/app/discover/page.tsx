import Link from "next/link";
import type { DiscoverGamesResponse } from "@indieforge/contracts";
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
        : "Không thể tải game lúc này. Vui lòng thử lại.";
  }
  const next = new URLSearchParams();
  if (query) next.set("query", query);
  if (data?.nextCursor) next.set("cursor", data.nextCursor);
  return (
    <main className="discover-page">
      <p className="eyebrow">Từ cộng đồng TFG</p>
      <h1>Khám phá game</h1>
      <p className="discover-page__lede">
        Những game nhỏ, ý tưởng mới và những người tạo ra chúng.
      </p>
      <form action="/discover" className="search-form">
        <label>
          Tìm kiếm game
          <input name="query" defaultValue={query} maxLength={200} />
        </label>
        <button>Tìm kiếm</button>
      </form>
      {error && (
        <div className="discover-state" role="alert">
          <p>{error}</p>
          <Link href={query ? `/discover?query=${encodeURIComponent(query)}` : "/discover"}>
            Thử lại
          </Link>
        </div>
      )}
      {data &&
        (data.games.length === 0 ? (
          <section className="discover-state" aria-labelledby="discover-empty-title">
            <h2 id="discover-empty-title">Chưa có game phù hợp.</h2>
            <p>Thử một từ khóa khác, hoặc xem tất cả game đang có trên TFG.</p>
            <Link href="/discover">Xem tất cả game</Link>
          </section>
        ) : (
          <div className="grid">
            {data.games.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
          </div>
        ))}
      {data?.nextCursor && (
        <Link className="button button-ghost" href={`/discover?${next}`}>
          Trang tiếp theo
        </Link>
      )}
    </main>
  );
}
