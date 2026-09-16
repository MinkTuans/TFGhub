import { redirect } from "next/navigation";
import { optionalSession } from "../../lib/session";
export default async function AdminPage() {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  redirect("/admin/library");
}
