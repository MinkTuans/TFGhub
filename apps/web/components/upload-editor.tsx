"use client";

import { useState, type FormEvent } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function UploadEditor({
  gameId,
  onUploaded,
}: {
  gameId: string;
  onUploaded: (game: GameSummary) => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const archive = new FormData(event.currentTarget).get("game");
    if (!(archive instanceof File) || archive.size === 0) {
      setError("Choose a .zip file to upload.");
      return;
    }
    const form = new FormData();
    form.set("game", archive);
    setError("");
    setPending(true);
    try {
      onUploaded(await api.post<GameSummary>(`/games/${gameId}/upload`, form));
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
    <section aria-labelledby="upload-heading">
      <h2 id="upload-heading">HTML5 upload</h2>
      <form onSubmit={upload} className="form-stack">
        <label>
          HTML5 ZIP archive
          <input name="game" type="file" accept=".zip,application/zip" required />
        </label>
        <p className="hint">Include index.html at the root of your ZIP file.</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>{pending ? "Uploading…" : "Upload game"}</button>
      </form>
    </section>
  );
}
