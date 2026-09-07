"use client";

import { resolveApiBaseUrl } from "../lib/api-client";

export function GamePreview({ gameId }: { gameId: string }) {
  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">Preview</h2>
      <iframe
        title="Game preview"
        src={`${resolveApiBaseUrl()}/games/${encodeURIComponent(gameId)}/preview/`}
        sandbox="allow-scripts allow-pointer-lock"
      />
    </section>
  );
}
