"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { apiErrorMessage } from "../lib/api-error-message";
import { uploadGame } from "../lib/game-upload";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function UploadEditor({
  gameId,
  artifactVersion = 0,
  onUploaded,
}: {
  gameId: string;
  artifactVersion?: number;
  onUploaded: (game: GameSummary) => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<
    "idle" | "uploading" | "processing" | "ready" | "failed"
  >("idle");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number>();
  const [progress, setProgress] = useState<{ loaded: number; total: number }>();
  const [replaced, setReplaced] = useState(false);
  const [selectionValid, setSelectionValid] = useState(true);

  function selectArchive(event: ChangeEvent<HTMLInputElement>) {
    const archive = event.currentTarget.files?.[0];
    setError("");
    setState("idle");
    setFileName(archive?.name ?? "");
    setFileSize(archive?.size);
    setProgress(undefined);
    setReplaced(false);
    if (!archive) {
      setSelectionValid(true);
      return;
    }
    if (!archive.name.toLowerCase().endsWith(".zip") || archive.size === 0) {
      setError("Chọn tệp .zip để tải lên.");
      setState("failed");
      setSelectionValid(false);
      return;
    }
    if (archive.size > MAX_UPLOAD_BYTES) {
      setError("Tệp ZIP không được vượt quá 100 MiB.");
      setState("failed");
      setSelectionValid(false);
      return;
    }
    setSelectionValid(true);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("game");
    const archive = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!archive || archive.size === 0) {
      setError("Chọn tệp .zip để tải lên.");
      setState("failed");
      return;
    }
    if (!archive.name.toLowerCase().endsWith(".zip")) {
      setError("Chọn tệp .zip để tải lên.");
      setState("failed");
      setSelectionValid(false);
      return;
    }
    if (archive.size > MAX_UPLOAD_BYTES) {
      setError("Tệp ZIP không được vượt quá 100 MiB.");
      setState("failed");
      setSelectionValid(false);
      return;
    }
    setError("");
    setFileName(archive.name);
    setState("uploading");
    setProgress(undefined);
    setReplaced(artifactVersion > 0);
    setPending(true);
    try {
      onUploaded(
        await uploadGame(gameId, archive, {
          onProgress: setProgress,
          onIndeterminate: () => setProgress(undefined),
          onTransferred: () => {
            setState("processing");
            setProgress(undefined);
          },
        }),
      );
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
            onChange={selectArchive}
          />
        </label>
        {fileName && (
          <p className="hint">
            Đã chọn: {fileName} ({fileSize ?? 0} B)
          </p>
        )}
        <p className="hint">
          Đặt index.html ở thư mục gốc của tệp ZIP. Tệp ZIP tối đa 100 MiB,
          tối đa 400 MiB sau khi giải nén và 2.000 mục.
        </p>
        <p className="hint">
          Đóng gói tệp ảnh, âm thanh và mã dùng đường dẫn tương đối trong cùng
          ZIP. Sau khi tải xong, mở Chơi thử rồi gửi duyệt khi game đã chạy.
        </p>
        <p className="hint">Với Unity/Godot, xuất bản Web không nén, một luồng; không đưa tệp .gz, .br, .unityweb hoặc tệp native vào ZIP.</p>
        {pending && (
          <>
            {progress ? (
              <progress
                aria-label="Tiến trình tải trò chơi"
                value={progress.loaded}
                max={progress.total}
              />
            ) : (
              <progress aria-label="Tiến trình tải trò chơi" />
            )}
            <p role="status">
              {state === "processing"
                ? "Đã gửi tệp. Đang chờ máy chủ kiểm tra…"
                : progress
                  ? `Đang tải ${fileName}: ${Math.floor((progress.loaded / progress.total) * 100)}%`
                  : `Đang tải ${fileName}…`}
            </p>
          </>
        )}
        {state === "ready" && (
          <>
            <p role="status">Đã tải lên. Bản chơi thử đã sẵn sàng.</p>
            {replaced && (
              <p className="hint">
                Bản mới đang ở trạng thái Bản nháp. Gửi duyệt lại để công khai.
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button disabled={pending || (!selectionValid && Boolean(fileName))}>
          {pending
            ? "Đang tải…"
            : state === "failed" && selectionValid
              ? "Thử lại tải trò chơi"
              : "Tải trò chơi lên"}
        </button>
      </form>
    </section>
  );
}
