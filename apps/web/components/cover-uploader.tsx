"use client";

import { useState, type FormEvent } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { GameCover } from "./game-cover";

function uploadErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Ảnh bìa không hợp lệ. Chọn một ảnh JPG, PNG hoặc WebP.";
    case 403:
      return "Bạn không có quyền thay đổi ảnh bìa game này.";
    case 413:
      return "Ảnh bìa quá lớn. Chọn ảnh không quá 5 MiB.";
    case 503:
      return "Dịch vụ lưu ảnh bìa tạm thời không khả dụng. Vui lòng thử lại sau.";
    default:
      return "Không thể tải ảnh bìa. Vui lòng thử lại.";
  }
}

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
        setError(uploadErrorMessage(response.status));
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
