import { redirect } from "next/navigation";
import type { AdminCategory, AdminDocument, AdminDocumentList } from "@indieforge/contracts";
import { AdminLibrary } from "../../../components/admin-library/admin-library";
import { optionalSession, privateGet } from "../../../lib/session";
export default async function AdminLibraryPage({ searchParams }: { searchParams?: Promise<{ sourcePath?: string }> }) {
  const session = await optionalSession();
  if (session?.role !== "ADMIN") redirect("/");
  const [categories, documents] = await Promise.all([
    privateGet<AdminCategory[]>("/admin/library/categories"),
    privateGet<AdminDocumentList>("/admin/library/documents?offset=0&limit=6"),
  ]);
  const sourcePath = (await searchParams)?.sourcePath;
  let document: AdminDocument | null = null;
  if (typeof sourcePath === "string" && sourcePath.length <= 500) {
    const matched = await privateGet<AdminDocumentList>(`/admin/library/documents?sourcePath=${encodeURIComponent(sourcePath)}&limit=1`);
    if (matched.items[0]) document = await privateGet<AdminDocument>(`/admin/library/documents/${encodeURIComponent(matched.items[0].id)}`);
  }
  return <main><AdminLibrary initialCategories={categories} initialDocuments={documents} initialDocument={document} /></main>;
}
