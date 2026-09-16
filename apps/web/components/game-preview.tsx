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
    <section className="panel editor-panel" aria-labelledby="preview-heading">
      <h2 id="preview-heading">Chơi thử</h2>
      <iframe
        title="Chơi thử trò chơi"
        src={`${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(gameId)}/preview/?v=${revision}`}
        sandbox="allow-scripts allow-pointer-lock"
      />
    </section>
  );
}
