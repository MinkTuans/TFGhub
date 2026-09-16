"use client";

import { useState, type FormEvent } from "react";
import { UpdateGameInput, type GameSummary } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";
import { CodeGameEditor } from "./code-game-editor";
import { GamePreview } from "./game-preview";
import { PlatformerGameEditor } from "./platformer-game-editor";
import { StoryGameEditor } from "./story-game-editor";
import { UploadEditor } from "./upload-editor";
import { CoverUploader } from "./cover-uploader";

function reviewLabel(game: GameSummary): string {
  switch (game.reviewState) {
    case "PENDING":
      return "Chờ duyệt";
    case "APPROVED":
      return "Đã duyệt";
    case "REJECTED":
      return "Bị từ chối";
    default:
      return "Bản nháp";
  }
}

export function GameWorkspace({ initialGame }: { initialGame: GameSummary }) {
  const [game, setGame] = useState(initialGame);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [displayError, setDisplayError] = useState("");
  const [savingDisplay, setSavingDisplay] = useState(false);
  const maySubmit =
    game.artifactVersion > 0 &&
    game.artifactReady &&
    (game.reviewState === "DRAFT" || game.reviewState === "REJECTED");

  async function saveDisplay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = UpdateGameInput.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setDisplayError("Kích thước phải là số nguyên từ 1 đến 4096.");
      return;
    }
    setDisplayError("");
    setSavingDisplay(true);
    try {
      setGame(await api.patch<GameSummary>(`/games/${game.id}`, parsed.data));
    } catch (error) {
      setDisplayError(
        apiErrorMessage(error, "Không thể lưu hiển thị. Vui lòng thử lại."),
      );
    } finally {
      setSavingDisplay(false);
    }
  }

  async function submitForReview() {
    setError("");
    setPending(true);
    try {
      setGame(await api.post<GameSummary>(`/games/${game.id}/submit`, {}));
    } catch (error) {
      setError(
        apiErrorMessage(error, "Không thể gửi duyệt. Vui lòng thử lại."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace">
      <nav className="workspace-sections" aria-label="Các phần quản lý trò chơi">
        <a href="#cover-heading">Thông tin & ảnh bìa</a>
        <a href="#display-heading">Hiển thị</a>
        <a href="#game-editor">Nội dung & chơi thử</a>
        <a href="#submission-heading">Xuất bản</a>
      </nav>
      <section
        className="panel workspace-overview"
        aria-labelledby="cover-heading"
      >
        <div className="workspace-metadata">
          <p className="eyebrow">Xưởng sáng tạo / Trò chơi của bạn</p>
          <h2 id="cover-heading">Ảnh bìa và thông tin</h2>
          <p className="description">
            {game.description ||
              "Thêm ảnh bìa để người chơi nhận ra trò chơi của bạn."}
          </p>
          <p className="hint">Đường dẫn: {game.slug}</p>
          <p className="badge" role="status" data-state={game.reviewState}>
            {reviewLabel(game)}
          </p>
        </div>
        <CoverUploader game={game} onUploaded={setGame} />
      </section>
      {game.reviewState === "REJECTED" && game.reviewNote && (
        <p role="alert">{game.reviewNote}</p>
      )}
      <section className="panel" aria-labelledby="display-heading">
        <h2 id="display-heading">Cài đặt hiển thị</h2>
        <form method="post" onSubmit={saveDisplay} className="form-stack">
          <div className="field-grid">
            <label>
              Chiều rộng hiển thị
              <input
                name="viewportWidth"
                type="number"
                min={1}
                max={4096}
                step={1}
                defaultValue={game.viewportWidth}
                required
                disabled={savingDisplay}
              />
            </label>
            <label>
              Chiều cao hiển thị
              <input
                name="viewportHeight"
                type="number"
                min={1}
                max={4096}
                step={1}
                defaultValue={game.viewportHeight}
                required
                disabled={savingDisplay}
              />
            </label>
          </div>
          <p className="hint">Tỷ lệ khung chơi, ví dụ 16 × 9 hoặc 4 × 3.</p>
          {displayError && <p role="alert">{displayError}</p>}
          <button disabled={savingDisplay}>
            {savingDisplay ? "Đang lưu…" : "Lưu hiển thị"}
          </button>
        </form>
      </section>
      <div className="workspace-editor" id="game-editor" tabIndex={-1}>
        {game.sourceType === "UPLOAD" && (
          <UploadEditor gameId={game.id} onUploaded={setGame} />
        )}
        {game.sourceType === "CODE" && (
          <CodeGameEditor
            gameId={game.id}
            initialProject={game.projectData}
            onBuilt={setGame}
            onSaved={setGame}
          />
        )}
        {game.sourceType === "STORY" && (
          <StoryGameEditor
            gameId={game.id}
            initialProject={game.projectData}
            onBuilt={setGame}
            onSaved={setGame}
          />
        )}
        {game.sourceType === "PLATFORMER" && (
          <PlatformerGameEditor
            gameId={game.id}
            initialProject={game.projectData}
            onBuilt={setGame}
            onSaved={setGame}
          />
        )}
        {game.artifactVersion > 0 && (
          <GamePreview gameId={game.id} revision={game.artifactVersion} />
        )}
      </div>
      <section
        className="panel submission-panel"
        aria-labelledby="submission-heading"
      >
        <div>
          <h2 id="submission-heading">Xuất bản trò chơi</h2>
          <p className="hint">
            Lưu và tạo bản chơi thử, sau đó gửi trò chơi để được kiểm duyệt.
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <button disabled={!maySubmit || pending} onClick={submitForReview}>
          {pending ? "Đang gửi…" : "Gửi duyệt"}
        </button>
      </section>
    </div>
  );
}
