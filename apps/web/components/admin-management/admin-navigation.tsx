"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./management.module.css";
export const adminSections = [
  { href: "/admin/users", title: "Người dùng", description: "Quản lý tài khoản, vai trò và quyền truy cập." },
  { href: "/admin/games", title: "Game", description: "Theo dõi game của mọi tác giả và quản lý hiển thị." },
  { href: "/admin/moderation", title: "Kiểm duyệt", description: "Xem xét các game đang chờ duyệt." },
  { href: "/admin/library", title: "Tài liệu", description: "Tra cứu và cập nhật tài liệu website." },
];
export function AdminNavigation() {
  const pathname = usePathname();
  return <nav className={styles.navigation} aria-label="Điều hướng quản trị">{[{ href: "/admin", title: "Tổng quan" }, ...adminSections].map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.title}</Link>)}</nav>;
}
