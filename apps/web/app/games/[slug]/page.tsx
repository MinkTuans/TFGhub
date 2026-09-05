import { notFound } from "next/navigation";
import type { PublicGameSummary } from "@indieforge/contracts";
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
  return (
    <main className="narrow">
      <article>
        <h1>{game.title}</h1>
        <p>By {game.developer.displayName}</p>
        <p className="description">{game.description}</p>
      </article>
    </main>
  );
}
