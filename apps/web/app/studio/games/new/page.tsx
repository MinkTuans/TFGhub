import Link from "next/link";
import "../../../../components/studio/studio-shell.css";
import { GameCreationPaths } from "../../../../components/game-creation-paths";
import { privateGet } from "../../../../lib/session";

export default async function NewGamePage() {
  await privateGet("/auth/me");
  return (
    <main className="create-game-page">
      <Link href="/studio">← Về Xưởng sáng tạo</Link>
      <header className="page-heading">
        <p className="eyebrow">Từ ý tưởng đến bản chơi thử</p>
        <h1>Tạo bản nháp trò chơi</h1>
      </header>
      <p>Bản nháp được giữ riêng tư và chưa xuất hiện trong Khám phá.</p>
      <GameCreationPaths />
      <Link className="creation-cancel" href="/studio">Quay lại Xưởng sáng tạo</Link>
    </main>
  );
}
