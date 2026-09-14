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
        Phaser 3 editor for {game.title}: scene board, assets, no-code events,
        TypeScript, then Build HTML5 or Build and publish through the scan
        pipeline.
      </p>
      <EngineForm gameId={game.id} />
    </main>
  );
}
