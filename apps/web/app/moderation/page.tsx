import { redirect } from "next/navigation";
import {
  ModerationQueue,
  type ModerationGame,
} from "../../components/moderation-queue";
import { optionalSession, privateGet } from "../../lib/session";

export default async function ModerationPage() {
  const session = await optionalSession();
  if (session?.role !== "MODERATOR" && session?.role !== "ADMIN") redirect("/");
  const games = await privateGet<ModerationGame[]>("/moderation/games");

  return (
    <main className="moderation-page">
      <header className="page-heading">
        <p className="eyebrow">Không gian kiểm duyệt</p>
        <h1>Hàng đợi kiểm duyệt</h1>
      </header>
      <p>Kiểm tra các game được gửi trước khi xuất hiện trong Khám phá.</p>
      <ModerationQueue initialGames={games} />
    </main>
  );
}
