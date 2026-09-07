"use client";

import { useState, type FormEvent } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

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
      setError("Chọn tệp .zip để tải lên.");
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
        apiErrorMessage(error, "Không thể tải game lên. Vui lòng thử lại."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel editor-panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Tải game HTML5</h2>
      <form onSubmit={upload} className="form-stack">
        <label>
          Tệp ZIP HTML5
          <input
            name="game"
            type="file"
            accept=".zip,application/zip"
            required
          />
        </label>
        <p className="hint">Đặt index.html ở thư mục gốc của tệp ZIP.</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>
          {pending ? "Đang tải…" : "Tải game lên"}
        </button>
      </form>
    </section>
  );
}
