import Link from "next/link";
import { redirect } from "next/navigation";
import { CommunityComments } from "../../../../../components/community-comments";
import { optionalSession } from "../../../../../lib/session";

export default async function ModerationCommentsPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await optionalSession();
  if (viewer?.role !== "MODERATOR" && viewer?.role !== "ADMIN") redirect("/");
  const { id } = await params;
  return <main className="analytics-page"><header className="page-heading"><Link href="/moderation">← Về kiểm duyệt</Link><h1>Kiểm duyệt bình luận</h1><p>Đọc và xóa bình luận không phù hợp. Quyền xem bình luận không cấp quyền xem thống kê riêng tư.</p></header><CommunityComments key={id} endpoint={`/games/${encodeURIComponent(id)}/community-comments`} viewer={{ id: viewer.id, role: viewer.role }} /></main>;
}
