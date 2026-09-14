import Link from "next/link";
import { notFound } from "next/navigation";
import type { GameSummary } from "@indieforge/contracts";
import { EngineForm } from "../../../../../components/engine-form";
import { privateGet } from "../../../../../lib/session";

export default async function StudioEnginePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const games = await privateGet<GameSummary[]>("/games/mine");
  const game = games.find((item) => item.id === id);
  if (!game) notFound();
  return (
    <main>
      <p>
        <Link href={`/studio/games/${game.id}`}>Back to release</Link>
      </p>
      <h1>Online engine</h1>
      <p className="hint">
        Phaser 3 starter for {game.title}. Edit the player and main.ts, preview,
        then build an HTML5 zip that uses the same scan pipeline as an uploaded
        release.
      </p>
      <EngineForm gameId={game.id} />
    </main>
  );
}
