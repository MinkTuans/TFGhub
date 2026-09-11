"use client";

import { useState } from "react";
import type { GameAssetSummary } from "@indieforge/contracts";
import { StudioConfirmation } from "../studio-confirmation";
import { STUDIO_ASSET_MIME } from "../asset-drop";
import type { AssetClient } from "./asset-manager";
import { AssetPreview } from "./asset-preview";

function intendedRole(asset: GameAssetSummary) {
  switch (asset.metadata.category) {
    case "CHARACTER":
    case "NPC":
      return "SPRITE";
    case "ITEM":
      return "ITEM";
    case "UI":
      return "UI";
    default:
      return "IMAGE";
  }
}

export function AssetGrid({
  gameId,
  assets,
  declaredAssetIds,
  client,
  onChanged,
}: {
  gameId: string;
  assets: GameAssetSummary[];
  declaredAssetIds: readonly string[];
  client: AssetClient;
  onChanged: (asset: GameAssetSummary | null, removedId?: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<GameAssetSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveName(asset: GameAssetSummary) {
    setBusy(true);
    setError("");
    try {
      const updated = await client.update(gameId, asset.id, {
        displayName: name,
      });
      onChanged(updated);
      setRenaming(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Không thể đổi tên",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(asset: GameAssetSummary) {
    setBusy(true);
    setError("");
    try {
      await client.tombstone(gameId, asset.id);
      onChanged(null, asset.id);
      setDeleting(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Không thể xóa asset",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!assets.length)
    return <p className="studio-muted">Không tìm thấy tài nguyên.</p>;
  return (
    <div className="studio-asset-grid">
      {assets.map((asset) => {
        const declared = declaredAssetIds.includes(asset.id);
        const draggable = asset.state === "READY" && asset.kind === "IMAGE";
        return (
          <article
            className="studio-asset-card"
            role="group"
            aria-label={`Asset ${asset.displayName}`}
            key={asset.id}
            draggable={draggable}
            onDragStart={(event) => {
              if (!draggable) return;
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(
                STUDIO_ASSET_MIME,
                JSON.stringify({
                  assetId: asset.id,
                  kind: asset.kind,
                  role: intendedRole(asset),
                }),
              );
            }}
          >
            <AssetPreview asset={asset} />
            {renaming === asset.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveName(asset);
                }}
              >
                <label>
                  Tên asset
                  <input
                    aria-label="Tên asset"
                    value={name}
                    maxLength={160}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !name.trim()}>
                  Lưu tên
                </button>
                <button type="button" onClick={() => setRenaming(null)}>
                  Hủy
                </button>
              </form>
            ) : (
              <>
                <strong>{asset.displayName}</strong>
                <small>
                  {asset.metadata.category ?? "USER"} · {asset.kind}
                </small>
                {declared && <span>Đang dùng trong dự án</span>}
                {asset.state !== "READY" && <span>Đã xóa</span>}
                <div className="studio-actions">
                  <button
                    type="button"
                    disabled={asset.state !== "READY"}
                    onClick={() => {
                      setName(asset.displayName);
                      setRenaming(asset.id);
                    }}
                  >
                    Đổi tên
                  </button>
                  <button
                    type="button"
                    aria-label="Xóa asset"
                    disabled={asset.state !== "READY"}
                    onClick={() => setDeleting(asset)}
                  >
                    Xóa
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
      {error && <p role="alert">{error}</p>}
      {deleting && (
        <StudioConfirmation
          title={`Xóa ${deleting.displayName}?`}
          disabled={busy || declaredAssetIds.includes(deleting.id)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        >
          {declaredAssetIds.includes(deleting.id) ? (
            <p>
              Asset đang được dùng trong dự án hiện tại. Hãy xóa các đối tượng
              phụ thuộc trước khi xóa asset.
            </p>
          ) : (
            <>
              <p>
                Asset sẽ biến mất khỏi thư viện nhưng dữ liệu phụ thuộc vẫn được
                giữ.
              </p>
              {(deleting.references.revisions > 0 ||
                deleting.references.builds > 0) && (
                <p>
                  {deleting.references.revisions} phiên bản đã lưu và{" "}
                  {deleting.references.builds} bản build vẫn tham chiếu asset
                  này.
                </p>
              )}
            </>
          )}
        </StudioConfirmation>
      )}
    </div>
  );
}
