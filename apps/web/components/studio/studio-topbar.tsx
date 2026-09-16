"use client";

import Link from "next/link";
import {
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type Ref,
} from "react";
import { UpdateGameInput, type GameSummary } from "@indieforge/contracts";
import { api } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/api-error-message";
import { useStudio } from "./studio-provider";

/** Tooltips appear on keyboard focus as well as pointer hover; Escape dismisses them. */
export function StudioButton({
  tooltip,
  children,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="studio-tooltip"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setVisible(false);
      }}
    >
      <button
        type="button"
        {...props}
        ref={ref}
        aria-describedby={visible ? id : undefined}
      >
        {children}
      </button>
      {visible && (
        <span id={id} role="tooltip">
          {tooltip}
        </span>
      )}
    </span>
  );
}

export function StudioTopbar({
  initialGame,
  sceneId,
  onSceneChange,
  settingsOpen,
  onSettingsToggle,
  settingsRef,
}: {
  initialGame: GameSummary;
  sceneId: string;
  onSceneChange: (id: string) => void;
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  settingsRef: Ref<HTMLButtonElement>;
}) {
  const { state, dispatch } = useStudio();
  const [game, setGame] = useState(initialGame);
  const [title, setTitle] = useState(game.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dirty = title !== game.title;
  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !dirty) return;
    const parsed = UpdateGameInput.safeParse({ title });
    if (!parsed.success) {
      setError("Tên trò chơi cần có 1–80 ký tự.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await api.patch<GameSummary>(
        `/games/${encodeURIComponent(game.id)}`,
        parsed.data,
      );
      setGame(saved);
      setTitle(saved.title);
    } catch (error) {
      setError(apiErrorMessage(error, "Không thể lưu tên. Vui lòng thử lại."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  const status =
    !state.ready && !state.recoveryError
      ? "Đang khôi phục…"
      : {
          SAVED: "Đã lưu",
          DIRTY: "Chưa lưu",
          SAVING: "Đang lưu…",
          UNSYNCED: "Chưa đồng bộ",
          CONFLICT: "Xung đột phiên bản",
        }[state.status];
  const publication =
    game.visibility === "PUBLIC" && game.reviewState === "APPROVED"
      ? "Đã xuất bản"
      : {
          DRAFT: "Bản nháp",
          PENDING: "Chờ duyệt",
          APPROVED: "Đã duyệt",
          REJECTED: "Bị từ chối",
        }[game.reviewState];
  return (
    <header className="studio-topbar">
      <div className="studio-topbar__identity">
        <Link className="studio-back" href="/studio">
          <span aria-hidden="true">←</span> Về Xưởng sáng tạo
        </Link>
        <h1 className="studio-wordmark">
          <span>TFG</span> Xưởng sáng tạo
        </h1>
        <span className="studio-badge">{publication}</span>
      </div>
      <form className="studio-title" onSubmit={saveTitle}>
        <label htmlFor="studio-game-title">Tên trò chơi</label>
        <div className="studio-title__field">
          <input
            id="studio-game-title"
            value={title}
            maxLength={80}
            required
            disabled={saving}
            aria-invalid={!!error}
            aria-describedby={
              error ? "studio-title-error" : "studio-title-status"
            }
            onChange={(event) => {
              setTitle(event.target.value);
              setError("");
            }}
          />
          <button type="submit" disabled={!dirty || saving}>
            Lưu tên
          </button>
        </div>
        <span
          id="studio-title-status"
          role="status"
          aria-label="Trạng thái tên trò chơi"
          className="studio-save-status"
        >
          {saving ? "Đang lưu tên…" : dirty ? "Chưa lưu tên" : "Đã lưu tên"}
        </span>
        {error && (
          <p id="studio-title-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="studio-topbar__project">
        <span
          className="studio-save-status"
          role="status"
          aria-label="Trạng thái dự án"
          data-state={state.status}
        >
          {status}
        </span>
        <span className="studio-revision">
          Phiên bản {state.acknowledged.revision}
        </span>
      </div>
      <div className="studio-desktop studio-topbar__tools">
        <div className="studio-history" role="group" aria-label="Lịch sử dự án">
          <StudioButton
            tooltip="Hoàn tác thay đổi dự án"
            aria-label="Hoàn tác"
            disabled={
              !state.ready || !!state.resolution || !state.history.past.length
            }
            onClick={() => dispatch({ type: "undo" })}
          >
            ↶
          </StudioButton>
          <StudioButton
            tooltip="Làm lại thay đổi dự án"
            aria-label="Làm lại"
            disabled={
              !state.ready || !!state.resolution || !state.history.future.length
            }
            onClick={() => dispatch({ type: "redo" })}
          >
            ↷
          </StudioButton>
        </div>
        <label className="studio-scene-select">
          Cảnh hiện tại
          <select
            value={sceneId}
            onChange={(event) => onSceneChange(event.target.value)}
          >
            {[...state.document.scenes]
              .sort((a, b) => a.order - b.order)
              .map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
          </select>
        </label>
        <StudioButton
          ref={settingsRef}
          tooltip="Bố cục các bảng và thông tin dự án"
          aria-label="Cài đặt Xưởng sáng tạo"
          aria-expanded={settingsOpen}
          aria-controls="studio-settings"
          onClick={onSettingsToggle}
        >
          Cài đặt
        </StudioButton>
      </div>
    </header>
  );
}
