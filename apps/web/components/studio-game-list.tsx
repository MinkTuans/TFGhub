"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { GameCover } from "./game-cover";
import { EmptyState } from "./empty-state";

const reviewLabels = { DRAFT: "Bản nháp", PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Bị từ chối" } as const;

type StudioCardGame = Pick<GameSummary, "id" | "slug" | "title" | "description" | "visibility" | "reviewState" | "updatedAt" | "coverVersion" | "coverContentType">;

export function StudioGameList({ games }: { games: StudioCardGame[] }) {
  const [query, setQuery] = useState("");
  const [review, setReview] = useState("");
  const [sort, setSort] = useState("updated");
  const term = query.trim().toLocaleLowerCase("vi");
  const filtered = games.filter((game) => (!review || game.reviewState === review) &&
    `${game.title} ${game.description}`.toLocaleLowerCase("vi").includes(term))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "vi") : b.updatedAt.localeCompare(a.updatedAt));

  if (!games.length) return <EmptyState title="Ý tưởng đầu tiên đang chờ bạn" description="Bạn chưa có bản nháp. Bắt đầu với một ý tưởng và tên game."><Link href="/studio/games/new">Tạo game đầu tiên</Link></EmptyState>;

  return <>
    <div className="studio-filters">
      <label>Tìm game của bạn<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên hoặc mô tả game…" /></label>
      <label>Trạng thái duyệt<select value={review} onChange={(event) => setReview(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Sắp xếp<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Cập nhật gần nhất</option><option value="title">Tên A–Z</option></select></label>
    </div>
    <p className="hint" role="status">{filtered.length} / {games.length} game</p>
    {filtered.length ? <div className="grid studio-games-grid">{filtered.map((game) => <article className="card studio-card" key={game.id}>
      <GameCover game={game} ownerGameId={game.id} />
      <div className="studio-card__body">
        <h3><Link href={`/studio/games/${encodeURIComponent(game.id)}`}>{game.title}</Link></h3>
        <div className="studio-card__states">
          <span className="badge">{game.visibility === "DRAFT" ? "Riêng tư" : game.visibility === "PUBLIC" ? "Công khai" : "Không niêm yết"}</span>
          <span className="badge" data-state={game.reviewState}>{reviewLabels[game.reviewState]}</span>
        </div>
        <p className="description">{game.description || "Thêm mô tả để giới thiệu game của bạn."}</p>
        <p className="hint">Cập nhật <time dateTime={game.updatedAt}>{new Date(game.updatedAt).toLocaleDateString("vi-VN", { timeZone: "UTC" })}</time></p>
      </div>
    </article>)}</div> : <EmptyState title="Không có game phù hợp" description="Thử tên khác hoặc xóa bộ lọc để xem lại game của bạn."><button className="button-secondary" onClick={() => { setQuery(""); setReview(""); }}>Xóa bộ lọc</button></EmptyState>}
  </>;
}
