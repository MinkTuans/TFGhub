"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "../lib/session";
import { LogoutButton } from "./logout-button";

type SiteNavigationProps = {
  session: SessionUser | null;
};

export function SiteNavigation({ session }: SiteNavigationProps) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // Discard the previous route's disclosure state, including browser history returns.
  if (openedAt !== null && openedAt !== pathname) setOpenedAt(null);
  const current = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`))
      ? "page" as const
      : undefined;
  const canModerate =
    session?.role === "MODERATOR" || session?.role === "ADMIN";

  return (
    <div className="site-navigation-shell" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpenedAt(null);
        toggle.current?.focus();
      }
    }}>
      <button ref={toggle} type="button" className="navigation-toggle button-ghost"
        aria-label={open ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
        aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpenedAt(open ? null : pathname)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d={open ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
        Menu
      </button>
      <nav id={menuId} aria-label="Điều hướng chính" className="site-navigation" data-open={open}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpenedAt(null);
        }}>
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
    </div>
  );
}
