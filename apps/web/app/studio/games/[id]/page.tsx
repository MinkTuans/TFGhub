import type { GameSummary } from "@indieforge/contracts";
import { GameWorkspace } from "../../../../components/game-workspace";
import { privateGet } from "../../../../lib/session";

export default async function GameWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await privateGet<GameSummary>(`/games/${id}`);
  return (
    <main className="workspace-page">
      <header className="page-heading">
        <h1>{game.title}</h1>
      </header>
      <GameWorkspace initialGame={game} />
    </main>
  );
}
