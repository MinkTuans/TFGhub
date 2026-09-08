"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "../lib/session";
import { LogoutButton } from "./logout-button";

type SiteNavigationProps = {
  session: SessionUser | null;
};

export function SiteNavigation({ session }: SiteNavigationProps) {
  const pathname = usePathname();
  const current = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`))
      ? "page" as const
      : undefined;
  const canModerate =
    session?.role === "MODERATOR" || session?.role === "ADMIN";

  return (
    <nav aria-label="Điều hướng chính" className="site-navigation">
      <Link href="/" aria-current={current("/")}>Trang chủ</Link>
      <Link href="/discover" aria-current={current("/discover")}>Khám phá</Link>
      {session ? (
        <>
          <Link href="/studio" aria-current={current("/studio")}>Xưởng sáng tạo</Link>
          <Link href="/profile" aria-current={current("/profile")}>Hồ sơ</Link>
          {canModerate && <Link href="/moderation" aria-current={current("/moderation")}>Kiểm duyệt</Link>}
          <LogoutButton />
        </>
      ) : (
        <Link href="/login" aria-current={current("/login")}>Đăng nhập</Link>
      )}
    </nav>
  );
}
