"use client";

import { useState, useSyncExternalStore } from "react";
import { api, resolvePublicApiBaseUrl } from "../lib/api-client";
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
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {games.length === 0 ? (
        <p>Không có game nào đang chờ duyệt.</p>
      ) : (
        <div className="moderation-grid">
          {games.map((game) => {
            const busy = reviewing.has(game.id);
            const note = notes[game.id] ?? "";
            return (
              <article
                className="panel moderation-card"
                aria-label={game.title}
                key={game.id}
              >
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
                  <time dateTime={game.submittedAt}>{game.submittedAt}</time>
                </p>
                <p className="description">{game.description}</p>
                {game.artifactReady && game.artifactVersion > 0 && (
                  <iframe
                    title="Chơi thử game"
                    src={`${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(game.id)}/preview/?v=${game.artifactVersion}`}
                    sandbox="allow-scripts allow-pointer-lock"
                  />
                )}
                <label>
                  Lý do từ chối
                  <textarea
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
