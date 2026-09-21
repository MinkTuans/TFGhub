import { redirect } from "next/navigation";
import { AdminNavigation } from "../../../components/admin-management/admin-navigation";
import {
  ModerationQueue,
  type ModerationGame,
} from "../../../components/moderation-queue";
import { optionalSession, privateGet } from "../../../lib/session";

export default async function AdminModerationPage() {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  const games = await privateGet<ModerationGame[]>("/moderation/games");
  return <main className="moderation-page">
    <AdminNavigation />
    <header className="page-heading">
      <p className="eyebrow">Không gian quản trị / Kiểm duyệt</p>
      <h1>Hàng đợi kiểm duyệt</h1>
    </header>
    <p>Kiểm tra các trò chơi được gửi trước khi xuất hiện trong Khám phá.</p>
    <ModerationQueue initialGames={games} />
  </main>;
}
