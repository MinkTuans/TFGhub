"use client";

import { useState, type FormEvent } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { GameCover } from "./game-cover";

export function CoverUploader({
  game,
  onUploaded,
}: {
  game: GameSummary;
  onUploaded: (game: GameSummary) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || file.size === 0) {
      setError("Chọn ảnh JPG, PNG hoặc WebP để tải lên.");
      return;
    }
    const body = new FormData();
    body.set("cover", file);
    setError("");
    setPending(true);
    try {
      const response = await fetch(
        `/api/games/${encodeURIComponent(game.id)}/cover`,
        {
          method: "POST",
          credentials: "include",
          body,
        },
      );
      if (!response.ok) {
        setError("Không thể tải ảnh bìa. Vui lòng thử lại.");
        return;
      }
      onUploaded((await response.json()) as GameSummary);
    } catch {
      setError("Không thể tải ảnh bìa. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="cover-uploader">
      <GameCover game={game} ownerGameId={game.id} />
      <form method="post" onSubmit={upload} className="form-stack">
        <label>
          Ảnh bìa game
          <input
            name="cover"
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            required
            disabled={pending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="hint">Ảnh JPG, PNG hoặc WebP. Nên dùng tỷ lệ 16:9.</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>
          {pending ? "Đang tải ảnh bìa…" : "Tải ảnh bìa lên"}
        </button>
      </form>
    </div>
  );
}
