import { notFound } from "next/navigation";
import type { PublicGameSummary } from "@indieforge/contracts";
import { DonateForm } from "../../../components/donate-form";
import { api, ApiError } from "../../../lib/api-client";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let game: PublicGameSummary;
  try {
    game = await api.get<PublicGameSummary>(
      `/games/by-slug/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const apiOrigin = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  return (
    <main className="narrow">
      <article>
        <h1>{game.title}</h1>
        <p>By {game.developer.displayName}</p>
        <p className="description">{game.description}</p>
        {game.playUrl && (
          <iframe
            className="play-frame"
            title={`Play ${game.title}`}
            src={`${apiOrigin}${game.playUrl}`}
            sandbox="allow-scripts allow-pointer-lock"
            referrerPolicy="no-referrer"
          />
        )}
        <DonateForm slug={game.slug} />
      </article>
    </main>
  );
}
