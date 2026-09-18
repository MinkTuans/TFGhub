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
  const [state, setState] = useState<"idle" | "ready" | "failed">("idle");
  const [fileName, setFileName] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("game");
    const archive = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!archive || archive.size === 0) {
      setError("Chọn tệp .zip để tải lên.");
      setState("failed");
      return;
    }
    const form = new FormData();
    form.set("game", archive);
    setError("");
    setFileName(archive.name);
    setState("idle");
    setPending(true);
    try {
      onUploaded(await api.post<GameSummary>(`/games/${gameId}/upload`, form));
      setState("ready");
    } catch (error) {
      setError(
        apiErrorMessage(error, "Không thể tải trò chơi lên. Vui lòng thử lại."),
      );
      setState("failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel editor-panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Tải trò chơi HTML5</h2>
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
        <p className="hint">
          Đặt index.html ở thư mục gốc của tệp ZIP. Tệp ZIP tối đa 25 MiB,
          tối đa 100 MiB sau khi giải nén và 1.000 mục.
        </p>
        <p className="hint">
          Đóng gói tệp ảnh, âm thanh và mã dùng đường dẫn tương đối trong cùng
          ZIP. Sau khi tải xong, mở Chơi thử rồi gửi duyệt khi game đã chạy.
        </p>
        {pending && (
          <>
            <progress aria-label="Tiến trình tải trò chơi" />
            <p role="status">Đang tải {fileName}…</p>
          </>
        )}
        {state === "ready" && (
          <p role="status">Đã tải lên. Bản chơi thử đã sẵn sàng.</p>
        )}
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>
          {pending
            ? "Đang tải…"
            : state === "failed"
              ? "Thử lại tải trò chơi"
              : "Tải trò chơi lên"}
        </button>
      </form>
    </section>
  );
}
