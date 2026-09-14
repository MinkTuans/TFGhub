import { notFound } from "next/navigation";
import type { GameSummary, GameVersionSummary } from "@indieforge/contracts";
import { ReleaseForm } from "../../../../components/release-form";
import { privateGet } from "../../../../lib/session";

export default async function StudioGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const games = await privateGet<GameSummary[]>("/games/mine");
  const game = games.find((item) => item.id === id);
  if (!game) notFound();
  const versions = await privateGet<GameVersionSummary[]>(
    `/games/${game.id}/versions`,
  );
  return (
    <main className="narrow">
      <h1>{game.title}</h1>
      <p className="badge">
        {game.visibility === "DRAFT"
          ? "Draft"
          : game.visibility === "PUBLIC"
            ? "Public"
            : "Unlisted"}
      </p>
      <p className="description">{game.description}</p>
      <ReleaseForm game={game} versions={versions} />
    </main>
  );
}
