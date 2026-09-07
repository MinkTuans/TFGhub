import { redirect } from "next/navigation";
import { ModerationQueue, type ModerationGame } from "../../components/moderation-queue";
import { optionalSession, privateGet } from "../../lib/session";

export default async function ModerationPage() {
  const session = await optionalSession();
  if (session?.role !== "MODERATOR" && session?.role !== "ADMIN") redirect("/");
  const games = await privateGet<ModerationGame[]>("/moderation/games");

  return (
    <main>
      <h1>Moderation queue</h1>
      <p>Review submitted games before they appear in discovery.</p>
      <ModerationQueue initialGames={games} />
    </main>
  );
}
