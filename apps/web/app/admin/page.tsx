import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalSession } from "../../lib/session";
import { AdminNavigation } from "../../components/admin-management/admin-navigation";
import styles from "../../components/admin-management/management.module.css";
const sections = [
  ["/admin/users", "Người dùng", "Quản lý tài khoản, vai trò và quyền truy cập."],
  ["/admin/games", "Game", "Theo dõi game của mọi tác giả và quản lý hiển thị."],
  ["/admin/moderation", "Kiểm duyệt", "Xem xét các game đang chờ duyệt."],
  ["/admin/library", "Tài liệu", "Tra cứu và cập nhật tài liệu website."],
];
export default async function AdminPage() {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  return <main className={styles.page}><AdminNavigation /><p className="eyebrow">Không gian quản trị</p><h1>Quản trị website</h1><p>Quản lý cộng đồng, nội dung và tài liệu TFG.</p><div className={styles.cards}>{sections.map(([href, title, description]) => <Link className={styles.card} key={href} href={href}><h2>{title}</h2><p>{description}</p></Link>)}</div></main>;
}
