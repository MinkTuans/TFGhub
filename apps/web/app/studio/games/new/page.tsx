import Link from "next/link";
import "../../../../components/studio/studio-shell.css";
import { CreateEngineGame } from "../../../../components/create-engine-game";
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
      <div className="creation-layout">
      <ol className="creation-steps" aria-label="Các bước sáng tạo">
        <li><strong>Bắt đầu với bản nháp</strong><p>Đặt tên và chọn mẫu Pixel Adventure hoặc dự án 2D trống.</p></li>
        <li><strong>Xây dựng thế giới của bạn</strong><p>Thêm cảnh, đối tượng và tài nguyên trong trình chỉnh sửa.</p></li>
        <li><strong>Thử và hoàn thiện</strong><p>Chạy xem trước để kiểm tra ý tưởng ngay trong Xưởng sáng tạo.</p></li>
      </ol>
      <section className="creation-start panel" aria-labelledby="creation-start-title">
        <p className="eyebrow">Bước đầu tiên</p>
        <h2 id="creation-start-title">Thế giới mới bắt đầu từ đây.</h2>
        <p>Đặt tên, chọn điểm bắt đầu và biến thế giới này thành của bạn.</p>
        <div className="creation-canvas" aria-hidden="true"><span>✦</span><span>+ Một ý tưởng mới</span></div>
        <div className="creation-start__privacy"><span aria-hidden="true">◇</span> Chỉ bạn có thể xem bản nháp này.</div>
        <CreateEngineGame />
        <Link className="creation-cancel" href="/studio">Quay lại Xưởng sáng tạo</Link>
      </section>
      </div>
    </main>
  );
}
