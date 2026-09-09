import Link from "next/link";
import {
  EngineProjectV2,
  type EngineProjectReadResponse,
  type GameSummary,
} from "@indieforge/contracts";
import { GameWorkspace } from "../../../../components/game-workspace";
import { StudioProvider } from "../../../../components/studio/studio-provider";
import { StudioShell } from "../../../../components/studio/studio-shell";
import { privateGet, type SessionUser } from "../../../../lib/session";

export default async function GameWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await privateGet<GameSummary>(`/games/${id}`);
  if (game.sourceType === "ENGINE") {
    const [response, owner] = await Promise.all([
      privateGet<EngineProjectReadResponse>(`/games/${id}/engine-project`),
      privateGet<SessionUser>("/auth/me"),
    ]);
    const project = EngineProjectV2.safeParse(
      response.status === "SUPPORTED" ? response.project : null,
    );
    if (
      response.status !== "SUPPORTED" ||
      !response.revision ||
      !project.success
    ) {
      return (
        <main>
          <Link href="/studio">Về Studio</Link>
          <h1>{game.title}</h1>
          <p role="alert">
            Chưa thể mở dự án trong phiên bản Studio này. Dữ liệu dự án được giữ
            nguyên.
          </p>
        </main>
      );
    }
    return (
      <StudioProvider
        identity={{
          userId: owner.id,
          gameId: game.id,
          projectId: project.data.projectId,
        }}
        initial={{
          document: project.data,
          revision: response.revision.revisionNumber,
        }}
      >
        <StudioShell key={game.id} initialGame={game} />
      </StudioProvider>
    );
  }
  return (
    <main className="workspace-page">
      <header className="page-heading">
        <h1>{game.title}</h1>
      </header>
      <GameWorkspace initialGame={game} />
    </main>
  );
}
