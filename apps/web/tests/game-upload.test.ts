import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadGame } from "../lib/game-upload";

class UploadXhr extends EventTarget {
  static current: UploadXhr | undefined;
  readonly upload = new EventTarget();
  method = "";
  url = "";
  withCredentials = false;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  body: FormData | undefined;

  constructor() {
    super();
    UploadXhr.current = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  UploadXhr.current = undefined;
});

describe("uploadGame", () => {
  it("reports computable upload bytes and resolves the accepted game", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api");
    vi.stubGlobal("XMLHttpRequest", UploadXhr);
    const onProgress = vi.fn();
    const onIndeterminate = vi.fn();
    const onTransferred = vi.fn();
    const archive = new File(["zip"], "quest.zip", {
      type: "application/zip",
    });

    const result = uploadGame("game-1", archive, {
      onProgress,
      onIndeterminate,
      onTransferred,
    });
    const xhr = UploadXhr.current!;
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 1024,
        total: 2048,
      }),
    );

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/games/game-1/upload");
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.body?.get("game")).toBe(archive);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 1024, total: 2048 });
    expect(onIndeterminate).not.toHaveBeenCalled();

    xhr.respond(
      201,
      JSON.stringify({ id: "game-1", artifactReady: true, artifactVersion: 1 }),
    );

    await expect(result).resolves.toMatchObject({
      id: "game-1",
      artifactReady: true,
      artifactVersion: 1,
    });
  });
});
