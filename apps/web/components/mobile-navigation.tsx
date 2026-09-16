"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icons = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  discover: "m16 8-3 5-5 3 3-5Z M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  studio: "M4 5h16v13H4Z M8 21h8 M12 18v3 M8 9l-2 2 2 2 M16 9l2 2-2 2",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
};
export function MobileNavigation({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Trang chủ", icon: icons.home },
    { href: "/discover", label: "Khám phá", icon: icons.discover },
    { href: "/studio", label: "Studio", icon: icons.studio },
    { href: authenticated ? "/profile" : "/login", label: authenticated ? "Hồ sơ" : "Tài khoản", icon: icons.user },
  ];
  return <nav className="mobile-dock" aria-label="Điều hướng nhanh">{items.map(({ href, label, icon }) => <Link key={href} href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg><span>{label}</span>
  </Link>)}</nav>;
}
