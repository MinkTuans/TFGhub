"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CreateGameVersionInput,
  type CreateGameVersionResponse,
  type GameSummary,
  type GameVersionSummary,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function ReleaseForm({
  game,
  versions = [],
}: {
  game: GameSummary;
  versions?: GameVersionSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState<GameVersionSummary | null>(null);
  const readyPast = versions.filter(
    (item) => item.status === "READY" && item.id !== version?.id,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = (
      event.currentTarget.elements.namedItem("build") as HTMLInputElement
    ).files?.[0];
    if (!file) {
      setError("Choose a .zip HTML5 build.");
      return;
    }
    const bytes = await file.arrayBuffer();
    const checksumSha256 = await sha256Hex(bytes);
    const input = CreateGameVersionInput.safeParse({
      filename: file.name,
      byteSize: file.size,
      checksumSha256,
    });
    if (!input.success) {
      setError("Use a .zip file up to 20MB with letters, numbers, dots, or hyphens.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const created = await api.post<CreateGameVersionResponse>(
        `/games/${game.id}/versions`,
        input.data,
      );
      await api.putBytes(created.uploadUrl, bytes);
      const completed = await api.post<GameVersionSummary>(
        `/games/${game.id}/versions/${created.id}/complete`,
        { checksumSha256 },
      );
      setVersion(completed);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to upload this build. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function rollback(versionId: string) {
    setPending(true);
    setError("");
    try {
      await api.post(`/games/${game.id}/rollback`, { versionId });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to roll back this build.",
      );
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (!version || version.status !== "READY") return;
    setPending(true);
    setError("");
    try {
      await api.post(`/games/${game.id}/publish`, { versionId: version.id });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to publish this build.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="release-heading">
      <h2 id="release-heading">Release a web build</h2>
      <p>
        Upload an HTML5 zip that contains <code>index.html</code>. The API stores
        it in quarantine, checks the checksum, and scans it before it can go
        public. A failed scan never replaces a live version.
      </p>
      <form onSubmit={submit} className="form-stack">
        <label>
          HTML5 zip
          <input name="build" type="file" accept=".zip,application/zip" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>
          {pending ? "Working…" : "Upload and scan"}
        </button>
      </form>
      {version && (
        <p className="badge">
          {version.status === "READY"
            ? "Ready to publish"
            : version.status === "REJECTED"
              ? `Rejected: ${version.findings}`
              : version.status}
        </p>
      )}
      {version?.status === "READY" && game.visibility !== "PUBLIC" && (
        <button className="button" disabled={pending} onClick={publish}>
          Publish this version
        </button>
      )}
      {game.visibility === "PUBLIC" && (
        <p className="badge">This game is public.</p>
      )}
      {game.visibility === "PUBLIC" && readyPast.length > 0 && (
        <div>
          <h3>Previous READY builds</h3>
          {readyPast.map((item) => (
            <p key={item.id}>
              {item.filename}{" "}
              <button
                type="button"
                className="button"
                disabled={pending}
                onClick={() => rollback(item.id)}
              >
                Roll back to this version
              </button>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
