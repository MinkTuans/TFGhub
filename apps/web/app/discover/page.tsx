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
        ? "This search is invalid. Try a new search."
        : "Unable to load games. Please try again.";
  }
  const next = new URLSearchParams();
  if (query) next.set("query", query);
  if (data?.nextCursor) next.set("cursor", data.nextCursor);
  return (
    <main>
      <h1>Discover games</h1>
      <p>Small games. Fresh ideas. Meet the people who make them.</p>
      <form action="/discover" className="search-form">
        <label>
          Search games
          <input name="query" defaultValue={query} maxLength={200} />
        </label>
        <button>Search</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {data &&
        (data.games.length === 0 ? (
          <p>No games found.</p>
        ) : (
          <div className="grid">
            {data.games.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
          </div>
        ))}
      {data?.nextCursor && <Link href={`/discover?${next}`}>Next page</Link>}
    </main>
  );
}
