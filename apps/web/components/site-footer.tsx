import Link from "next/link";
import type { SessionUser } from "../lib/session";

export function SiteFooter({ session }: { session: SessionUser | null }) {
  const canModerate = session?.role === "MODERATOR" || session?.role === "ADMIN";
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__intro">
          <Link href="/" className="site-footer__brand">TFG</Link>
          <p>Không gian cho người chơi và nhà sáng tạo độc lập.<br />Ý tưởng nhỏ, trải nghiệm đáng nhớ.</p>
          <small>© {new Date().getFullYear()} TFG</small>
        </div>
        <nav aria-label="Khám phá TFG">
          <h2>Khám phá</h2>
          <Link href="/discover">Khám phá trò chơi</Link>
          <Link href="/">Trang chủ</Link>
        </nav>
        <nav aria-label="Dành cho người sáng tạo">
          <h2>Sáng tạo</h2>
          <Link href="/studio">Xưởng sáng tạo</Link>
          <Link href="/huong-dan">Hướng dẫn tạo game pixel</Link>
          <Link href={session ? "/profile" : "/register"}>{session ? "Hồ sơ của bạn" : "Tạo tài khoản"}</Link>
          {canModerate && <Link href="/moderation">Kiểm duyệt</Link>}
        </nav>
      </div>
    </footer>
  );
}
