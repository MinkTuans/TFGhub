"use client";

import { resolvePublicApiBaseUrl } from "../lib/api-client";

export function GamePreview({
  gameId,
  revision,
}: {
  gameId: string;
  revision: number;
}) {
  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">Preview</h2>
      <iframe
        title="Game preview"
        src={`${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(gameId)}/preview/?v=${revision}`}
        sandbox="allow-scripts allow-pointer-lock"
      />
    </section>
  );
}
