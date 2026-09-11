"use client";

import type { GameAssetSummary } from "@indieforge/contracts";
import Image from "next/image";
import { resolveApiBaseUrl } from "../../../lib/api-client";

function mediaUrl(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${resolveApiBaseUrl().replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function AssetPreview({ asset }: { asset: GameAssetSummary }) {
  const thumbnail = mediaUrl(asset.thumbnailUrl ?? asset.contentUrl);
  if (asset.kind === "IMAGE" && thumbnail)
    return (
      <Image
        className="studio-asset-preview"
        src={thumbnail}
        alt={`Xem trước ${asset.displayName}`}
        width={asset.metadata.thumbnail?.width ?? asset.width ?? 1}
        height={asset.metadata.thumbnail?.height ?? asset.height ?? 1}
        loading="lazy"
        decoding="async"
        unoptimized
      />
    );
  if (asset.kind === "AUDIO" && asset.contentUrl)
    return (
      <audio
        className="studio-asset-audio"
        aria-label={`Nghe thử ${asset.displayName}`}
        controls
        preload="none"
        src={mediaUrl(asset.contentUrl) ?? undefined}
      />
    );
  return (
    <span className="studio-asset-placeholder" aria-hidden="true">
      {asset.kind}
    </span>
  );
}
