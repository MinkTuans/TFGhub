import { GameForm } from "../../../../components/game-form";
import { privateGet } from "../../../../lib/session";

export default async function NewGamePage() {
  await privateGet("/auth/me");
  return (
    <main className="narrow">
      <header className="page-heading">
        <h1>Tạo bản nháp game</h1>
      </header>
      <p>Bản nháp được giữ riêng tư và chưa xuất hiện trong Khám phá.</p>
      <GameForm />
    </main>
  );
}
