import Link from "next/link";
import { CreateEngineGame } from "../../../../components/create-engine-game";
import { privateGet } from "../../../../lib/session";

export default async function NewGamePage() {
  await privateGet("/auth/me");
  return (
    <main className="narrow create-game-page">
      <Link href="/studio">← Về Studio</Link>
      <header className="page-heading">
        <p className="eyebrow">Từ ý tưởng đến bản chơi thử</p>
        <h1>Tạo bản nháp game</h1>
      </header>
      <p>Bản nháp được giữ riêng tư và chưa xuất hiện trong Khám phá.</p>
      <ol className="creation-steps">
        <li><strong>Bắt đầu với bản nháp</strong><p>Tạo một dự án trống trong Studio.</p></li>
        <li><strong>Xây dựng thế giới của bạn</strong><p>Thêm cảnh, đối tượng và tài nguyên trong trình chỉnh sửa.</p></li>
        <li><strong>Thử và hoàn thiện</strong><p>Chạy xem trước để kiểm tra ý tưởng ngay trong Studio.</p></li>
      </ol>
      <CreateEngineGame />
    </main>
  );
}
