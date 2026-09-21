import type { GameSummary } from "@indieforge/contracts";

import { ApiError, resolvePublicApiBaseUrl } from "./api-client";

export type UploadCallbacks = {
  onProgress: (progress: { loaded: number; total: number }) => void;
  onIndeterminate: () => void;
  onTransferred: () => void;
};

function errorMessage(xhr: XMLHttpRequest): string {
  const fallback = `Request failed (${xhr.status})`;
  try {
    const payload: unknown = JSON.parse(xhr.responseText);
    if (typeof payload !== "object" || payload === null || !("message" in payload))
      return fallback;
    const { message } = payload;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((item) => typeof item === "string"))
      return message.join(", ");
  } catch {
    // Preserve the status fallback for a non-JSON response.
  }
  return fallback;
}

export function uploadGame(
  gameId: string,
  archive: File,
  callbacks: UploadCallbacks,
): Promise<GameSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.set("game", archive);
    xhr.open(
      "POST",
      `${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(gameId)}/upload`,
    );
    xhr.withCredentials = true;
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0)
        callbacks.onProgress({ loaded: event.loaded, total: event.total });
      else callbacks.onIndeterminate();
    });
    xhr.upload.addEventListener("load", callbacks.onTransferred);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, errorMessage(xhr)));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as GameSummary);
      } catch {
        reject(new ApiError(xhr.status, "Invalid upload response"));
      }
    };
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => {
      reject(new ApiError(0, "Upload request failed"));
    };
    xhr.send(form);
  });
}
