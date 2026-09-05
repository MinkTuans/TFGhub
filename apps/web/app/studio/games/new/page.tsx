import { GameForm } from "../../../../components/game-form";
import { privateGet } from "../../../../lib/session";

export default async function NewGamePage() {
  await privateGet("/auth/me");
  return (
    <main className="narrow">
      <h1>Create a game draft</h1>
      <p>Drafts stay private and will not appear in Discover.</p>
      <GameForm />
    </main>
  );
}
