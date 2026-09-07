"use client";

import { useState } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";
import { GamePreview } from "./game-preview";
import { UploadEditor } from "./upload-editor";

function reviewLabel(game: GameSummary): string {
  switch (game.reviewState) {
    case "PENDING":
      return "Pending review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return "Draft";
  }
}

export function GameWorkspace({ initialGame }: { initialGame: GameSummary }) {
  const [game, setGame] = useState(initialGame);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const maySubmit =
    game.artifactVersion > 0 &&
    (game.reviewState === "DRAFT" || game.reviewState === "REJECTED");

  async function submitForReview() {
    setError("");
    setPending(true);
    try {
      setGame(await api.post<GameSummary>(`/games/${game.id}/submit`, {}));
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p role="status">{reviewLabel(game)}</p>
      {game.reviewState === "REJECTED" && game.reviewNote && (
        <p role="alert">{game.reviewNote}</p>
      )}
      {game.sourceType === "UPLOAD" && (
        <UploadEditor gameId={game.id} onUploaded={setGame} />
      )}
      {game.artifactVersion > 0 && <GamePreview gameId={game.id} />}
      {error && <p role="alert">{error}</p>}
      <button disabled={!maySubmit || pending} onClick={submitForReview}>
        {pending ? "Submitting…" : "Submit for review"}
      </button>
    </>
  );
}
