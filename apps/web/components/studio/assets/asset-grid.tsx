"use client";

import { useState } from "react";
import type { GameAssetSummary } from "@indieforge/contracts";
import { StudioConfirmation } from "../studio-confirmation";
import { STUDIO_ASSET_MIME } from "../asset-drop";
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

function placementPayload(asset: GameAssetSummary) {
  return JSON.stringify({
    assetId: asset.id,
    kind: asset.kind,
    role: intendedRole(asset),
  });
}

export function AssetGrid({
  assets,
  declaredAssetIds,
  referencedAssetIds,
  onRename,
  onTombstone,
  onPlaceAsset,
}: {
  assets: GameAssetSummary[];
  declaredAssetIds: readonly string[];
  referencedAssetIds: ReadonlySet<string>;
  onRename: (asset: GameAssetSummary, displayName: string) => Promise<void>;
  onTombstone: (asset: GameAssetSummary) => Promise<void>;
  onPlaceAsset?: (payload: string) => void;
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
      await onRename(asset, name);
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
      await onTombstone(asset);
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
        const referenced = referencedAssetIds.has(asset.id);
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
                placementPayload(asset),
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
                {referenced ? (
                  <span>Đang dùng trong dự án</span>
                ) : (
                  declared && <span>Đã khai báo trong dự án</span>
                )}
                {asset.state !== "READY" && <span>Đã xóa</span>}
                <div className="studio-actions">
                  {draggable && onPlaceAsset && (
                    <button
                      type="button"
                      aria-label={`Thêm ${asset.displayName} vào Scene`}
                      onClick={() => onPlaceAsset(placementPayload(asset))}
                    >
                      Thêm vào Scene
                    </button>
                  )}
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
          disabled={busy || referencedAssetIds.has(deleting.id)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        >
          {referencedAssetIds.has(deleting.id) ? (
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
