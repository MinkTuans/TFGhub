import Link from "next/link";
import { CreateEngineGame } from "../../../../components/create-engine-game";
import { privateGet } from "../../../../lib/session";

export default async function NewGamePage() {
  await privateGet("/auth/me");
  return (
    <main className="create-game-page">
      <Link href="/studio">← Về Studio</Link>
      <header className="page-heading">
        <p className="eyebrow">Từ ý tưởng đến bản chơi thử</p>
        <h1>Tạo bản nháp game</h1>
      </header>
      <p>Bản nháp được giữ riêng tư và chưa xuất hiện trong Khám phá.</p>
      <div className="creation-layout">
      <ol className="creation-steps" aria-label="Các bước sáng tạo">
        <li><strong>Bắt đầu với bản nháp</strong><p>Tạo một dự án trống trong Studio.</p></li>
        <li><strong>Xây dựng thế giới của bạn</strong><p>Thêm cảnh, đối tượng và tài nguyên trong trình chỉnh sửa.</p></li>
        <li><strong>Thử và hoàn thiện</strong><p>Chạy xem trước để kiểm tra ý tưởng ngay trong Studio.</p></li>
      </ol>
      <section className="creation-start panel" aria-labelledby="creation-start-title">
        <p className="eyebrow">Bước đầu tiên</p>
        <h2 id="creation-start-title">Thế giới mới bắt đầu từ đây.</h2>
        <p>Tạo một dự án trống, rồi đặt tên và xây dựng từng cảnh trong Studio.</p>
        <div className="creation-canvas" aria-hidden="true"><span>✦</span><span>+ Một ý tưởng mới</span></div>
        <div className="creation-start__privacy"><span aria-hidden="true">◇</span> Chỉ bạn có thể xem bản nháp này.</div>
        <CreateEngineGame />
        <Link className="creation-cancel" href="/studio">Quay lại Studio</Link>
      </section>
      </div>
    </main>
  );
}
