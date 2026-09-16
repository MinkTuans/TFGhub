import { redirect } from "next/navigation";
import type { AdminManagedUserList } from "@indieforge/contracts";
import { AdminUsers } from "../../../components/admin-management/admin-users";
import { optionalSession, privateGet } from "../../../lib/session";
export default async function AdminUsersPage() {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  const users = await privateGet<AdminManagedUserList>("/admin/users?offset=0&limit=10");
  return <AdminUsers initialUsers={users} currentUserId={session.id} />;
}
