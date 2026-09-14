import Link from "next/link";
import type { DonationSummary, GameSummary } from "@indieforge/contracts";
import { ProfileForm, type Profile } from "../../components/profile-form";
import { ApiError } from "../../lib/api-client";
import { privateGet } from "../../lib/session";

export default async function StudioPage() {
  const [games, profile, donations] = await Promise.all([
    privateGet<GameSummary[]>("/games/mine"),
    privateGet<Profile>("/developers/me").catch((error) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    privateGet<DonationSummary[]>("/donations/received"),
  ]);
  return (
    <main>
      <h1>Your studio</h1>
      <p>A little space to start something new.</p>
      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading">Developer profile</h2>
        <ProfileForm profile={profile} />
      </section>
      <section aria-labelledby="donations-heading">
        <h2 id="donations-heading">Sandbox donations</h2>
        {donations.length === 0 ? (
          <p>No completed test donations yet.</p>
        ) : (
          <ul>
            {donations.map((donation) => (
              <li key={donation.id}>
                {(donation.netCents / 100).toFixed(2)} USD net on {donation.gameSlug}{" "}
                (fee {(donation.feeCents / 100).toFixed(2)})
              </li>
            ))}
          </ul>
        )}
      </section>
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
                <h3>{game.title}</h3>
                <p className="badge">
                  {game.visibility === "DRAFT"
                    ? "Draft"
                    : game.visibility === "PUBLIC"
                      ? "Public"
                      : "Unlisted"}
                </p>
                <p className="description">{game.description}</p>
                <Link href={`/studio/games/${game.id}`}>Manage release</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
