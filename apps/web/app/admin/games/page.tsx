import { redirect } from "next/navigation";
import type { AdminManagedGameList } from "@indieforge/contracts";
import { AdminGames } from "../../../components/admin-management/admin-games";
import { optionalSession, privateGet } from "../../../lib/session";
export default async function AdminGamesPage() {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  const games = await privateGet<AdminManagedGameList>("/admin/games?offset=0&limit=10");
  return <AdminGames initialGames={games} />;
}
