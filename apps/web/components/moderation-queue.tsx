"use client";

import { useState, useSyncExternalStore } from "react";
import { api, resolvePublicApiBaseUrl } from "../lib/api-client";
import { EmptyState } from "./empty-state";
import { apiErrorMessage } from "../lib/api-error-message";

export type ModerationGame = {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessMode: "GUEST_ALLOWED" | "AUTH_REQUIRED";
  sourceType: "UPLOAD" | "CODE" | "STORY" | "PLATFORMER";
  artifactVersion: number;
  artifactReady: boolean;
  submittedAt: string;
  creator: { id: string; displayName: string | null };
};

function submittedDate(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("vi-VN", { timeZone: "UTC" })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

const subscribeToNothing = () => () => {};

export function ModerationQueue({
  initialGames,
}: {
  initialGames: ModerationGame[];
}) {
  const [games, setGames] = useState(initialGames);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  async function review(game: ModerationGame, action: "approve" | "reject") {
    const note = notes[game.id]?.trim() ?? "";
    if (action === "reject" && !note) return;
    setReviewing((current) => new Set(current).add(game.id));
    setError("");
    try {
      await api.post(
        `/moderation/games/${encodeURIComponent(game.id)}/${action}`,
        {
          artifactVersion: game.artifactVersion,
          submittedAt: game.submittedAt,
          ...(action === "reject" ? { reviewNote: note } : {}),
        },
      );
      setGames((current) => current.filter(({ id }) => id !== game.id));
      setMessage(action === "approve" ? "Đã duyệt game." : "Đã từ chối game.");
    } catch (failure) {
      setError(
        apiErrorMessage(failure, "Không thể duyệt game này. Vui lòng thử lại."),
      );
    } finally {
      setReviewing((current) => {
        const next = new Set(current);
        next.delete(game.id);
        return next;
      });
    }
  }

  return (
    <section
      aria-label="Game chờ duyệt"
      data-hydrated={hydrated}
      data-testid="moderation-queue"
    >
      <p className="moderation-count">{games.length} game chờ duyệt</p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {games.length === 0 ? (
        <EmptyState title="Đã xử lý hết hàng đợi" description="Không có game nào đang chờ duyệt." />
      ) : (
        <div className="moderation-grid">
          {games.map((game) => {
            const busy = reviewing.has(game.id);
            const note = notes[game.id] ?? "";
            return (
              <article
                className="panel moderation-card moderation-row"
                aria-label={game.title}
                key={game.id}
              >
                <div className="moderation-card__info">

                <h2>{game.title}</h2>
                <p>Tác giả: {game.creator.displayName ?? "Chưa có tên"}</p>
                <p>
                  Nguồn:{" "}
                  {
                    {
                      UPLOAD: "HTML5 ZIP",
                      CODE: "Trình soạn mã",
                      STORY: "Cốt truyện / đố vui",
                      PLATFORMER: "Đi cảnh 2D",
                    }[game.sourceType]
                  }
                </p>
                <p>
                  Ngày gửi:{" "}
                  <time dateTime={game.submittedAt}>{submittedDate(game.submittedAt)}</time>
                </p>
                <span className="badge" data-state="PENDING">Chờ duyệt</span>
                </div>
                <details className="moderation-review">
                <summary>Kiểm tra bản gửi</summary>
                <div className="moderation-review__content">
                <p className="description">{game.description}</p>
                <p className="hint">Bản gửi: {game.artifactVersion}</p>
                <div className="moderation-card__preview">
                <h3>Chơi thử & kiểm tra</h3>
                {game.artifactReady && game.artifactVersion > 0 ? (
                  <iframe
                    title="Chơi thử game"
                    src={`${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(game.id)}/preview/?v=${game.artifactVersion}`}
                    sandbox="allow-scripts allow-pointer-lock"
                  />
                ) : <p className="hint">Bản chơi thử chưa sẵn sàng.</p>}
                </div>
                <div className="moderation-card__decision">
                <h3>Quyết định kiểm duyệt</h3>
                <p className="hint">Chơi thử và kiểm tra nội dung. Nếu từ chối, ghi rõ điều tác giả cần sửa.</p>
                <label>
                  Lý do từ chối
                  <textarea
                    disabled={busy}
                    value={note}
                    maxLength={500}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [game.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => review(game, "approve")}
                  >
                    {busy ? "Đang duyệt…" : "Duyệt"}
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    disabled={busy || !note.trim()}
                    onClick={() => review(game, "reject")}
                  >
                    {busy ? "Đang duyệt…" : "Từ chối"}
                  </button>
                </div>
                </div>
                </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
