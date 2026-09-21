"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GameSummary } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";
import { StudioConfirmation } from "./studio/studio-confirmation";

export function GameLifecycleActions({
  game,
  onGameChange,
}: {
  game: GameSummary;
  onGameChange: (game: GameSummary) => void;
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canHide = game.reviewState === "PENDING" || game.reviewState === "APPROVED";

  async function hide() {
    setError("");
    setPending(true);
    try {
      onGameChange(await api.post<GameSummary>(`/games/${encodeURIComponent(game.id)}/hide`, {}));
    } catch (error) {
      setError(apiErrorMessage(error, "Không thể ẩn trò chơi. Vui lòng thử lại."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError("");
    setPending(true);
    try {
      await api.delete(`/games/${encodeURIComponent(game.id)}`, undefined);
      router.replace("/studio");
      router.refresh();
    } catch (error) {
      setError(apiErrorMessage(error, "Không thể xóa trò chơi. Vui lòng thử lại."));
      setConfirmingDelete(false);
    } finally {
      setPending(false);
    }
  }

  return <section className="game-lifecycle" aria-label="Quản lý vòng đời trò chơi">
    {canHide && <button type="button" disabled={pending} onClick={hide}>{pending ? "Đang ẩn…" : "Ẩn khỏi công khai"}</button>}
    {game.visibility === "DRAFT" && <button type="button" className="danger" disabled={pending} onClick={() => setConfirmingDelete(true)}>Xóa vĩnh viễn</button>}
    {error && <p role="alert">{error}</p>}
    {confirmingDelete && <StudioConfirmation
      title="Xóa vĩnh viễn trò chơi?"
      confirmLabel={pending ? "Đang xóa…" : "Xác nhận xóa"}
      disabled={pending}
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={() => void remove()}
    >
      <p>Thao tác này không thể hoàn tác. Toàn bộ bản chơi và ảnh bìa sẽ bị xóa.</p>
    </StudioConfirmation>}
  </section>;
}
