"use client";

import { useState } from "react";
import { api, ApiError, resolveApiBaseUrl } from "../lib/api-client";

export type ModerationGame = {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessMode: "GUEST_ALLOWED" | "AUTH_REQUIRED";
  sourceType: "UPLOAD" | "CODE" | "STORY" | "PLATFORMER";
  artifactVersion: number;
  artifactReady: boolean;
  submittedAt: string | null;
  creator: { id: string; displayName: string | null };
};

export function ModerationQueue({ initialGames }: { initialGames: ModerationGame[] }) {
  const [games, setGames] = useState(initialGames);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function review(game: ModerationGame, action: "approve" | "reject") {
    const note = notes[game.id]?.trim() ?? "";
    if (action === "reject" && !note) return;
    setReviewing(game.id);
    setError("");
    try {
      await api.post(
        `/moderation/games/${encodeURIComponent(game.id)}/${action}`,
        action === "reject" ? { reviewNote: note } : {},
      );
      setGames((current) => current.filter(({ id }) => id !== game.id));
      setMessage(action === "approve" ? "Game approved." : "Game rejected.");
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to review this game. Please try again.",
      );
    } finally {
      setReviewing(null);
    }
  }

  return (
    <section aria-label="Pending games">
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {games.length === 0 ? (
        <p>No games are waiting for review.</p>
      ) : (
        <div className="grid">
          {games.map((game) => {
            const busy = reviewing === game.id;
            const note = notes[game.id] ?? "";
            return (
              <article className="card" aria-label={game.title} key={game.id}>
                <h2>{game.title}</h2>
                <p>By {game.creator.displayName ?? "Unknown developer"}</p>
                <p className="description">{game.description}</p>
                {game.artifactReady && game.artifactVersion > 0 && (
                  <iframe
                    title="Game preview"
                    src={`${resolveApiBaseUrl()}/games/${encodeURIComponent(game.id)}/preview/?v=${game.artifactVersion}`}
                    sandbox="allow-scripts allow-pointer-lock"
                  />
                )}
                <label>
                  Rejection note
                  <textarea
                    value={note}
                    maxLength={500}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [game.id]: event.target.value }))
                    }
                  />
                </label>
                <div className="actions">
                  <button type="button" disabled={busy} onClick={() => review(game, "approve")}>
                    {busy ? "Reviewing…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !note.trim()}
                    onClick={() => review(game, "reject")}
                  >
                    {busy ? "Reviewing…" : "Reject"}
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
