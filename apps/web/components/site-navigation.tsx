import Link from "next/link";
import type { SessionUser } from "../lib/session";
import { LogoutButton } from "./logout-button";

type SiteNavigationProps = {
  session: SessionUser | null;
};

export function SiteNavigation({ session }: SiteNavigationProps) {
  const canModerate =
    session?.role === "MODERATOR" || session?.role === "ADMIN";

  return (
    <nav aria-label="Điều hướng chính" className="site-navigation">
      <Link href="/">Trang chủ</Link>
      <Link href="/discover">Khám phá</Link>
      {session ? (
        <>
          <Link href="/studio">Xưởng sáng tạo</Link>
          <Link href="/profile">Hồ sơ</Link>
          {canModerate && <Link href="/moderation">Kiểm duyệt</Link>}
          <LogoutButton />
        </>
      ) : (
        <Link href="/login">Đăng nhập</Link>
      )}
    </nav>
  );
}
