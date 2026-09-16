"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function DiscoverSearch({ query }: { query: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("query");
    const params = new URLSearchParams();
    if (typeof value === "string" && value) params.set("query", value);
    startTransition(() => router.push(params.size ? `/discover?${params}` : "/discover"));
  }
  return (
    <>
      <form method="get" action="/discover" className="search-form" onSubmit={search} aria-busy={pending}>
        <label>Tìm kiếm game<input name="query" placeholder="Tên game hoặc ý tưởng bạn muốn khám phá…" defaultValue={query} maxLength={200} disabled={pending} /></label>
        <button disabled={pending}>{pending ? "Đang tìm…" : "Tìm kiếm"}</button>
      </form>
      {pending && <div className="catalog-search-loading" role="status">
        Đang tìm kiếm game…
        <div className="skeleton" aria-hidden="true" />
      </div>}
    </>
  );
}
