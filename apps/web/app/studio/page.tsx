import Link from "next/link";
import type { GameSummary } from "@indieforge/contracts";
import { privateGet } from "../../lib/session";

export default async function StudioPage() {
  const games = await privateGet<GameSummary[]>("/games/mine");
  return (
    <main>
      <h1>Your studio</h1>
      <p>A little space to start something new.</p>
      <section aria-labelledby="games-heading">
        <div className="section-heading">
          <h2 id="games-heading">Your games</h2>
          <Link className="button" href="/studio/games/new">
            Create a draft
          </Link>
        </div>
        {games.length === 0 ? (
          <p>No drafts yet. Start with a title and an idea.</p>
        ) : (
          <div className="grid">
            {games.map((game) => (
              <article className="card" key={game.id}>
                <h3>
                  <Link href={`/studio/games/${game.id}`}>{game.title}</Link>
                </h3>
                <p className="badge">
                  {game.visibility === "DRAFT"
                    ? "Draft"
                    : game.visibility === "PUBLIC"
                      ? "Public"
                      : "Unlisted"}
                </p>
                <p className="description">{game.description}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
