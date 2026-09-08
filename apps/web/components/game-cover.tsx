import type { PublicGameSummary } from "@indieforge/contracts";
import type { CSSProperties } from "react";
import { resolvePublicApiBaseUrl } from "../lib/api-client";

/* eslint-disable @next/next/no-img-element -- Cover URLs are versioned API resources. */

type CoverGame = Pick<
  PublicGameSummary,
  "slug" | "title" | "coverVersion" | "coverContentType"
>;

export function coverHue(slug: string): number {
  let hue = 0;
  for (const character of slug) {
    hue = (hue * 31 + (character.codePointAt(0) ?? 0)) % 360;
  }
  return hue;
}

function initials(title: string): string {
  const letters = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (letters || "TFG").toLocaleUpperCase("vi");
}

export function GameCover({
  game,
  size = "card",
  priority = false,
  ownerGameId,
}: {
  game: CoverGame;
  size?: "card" | "compact";
  priority?: boolean;
  ownerGameId?: string;
}) {
  const hasCover = game.coverVersion > 0;
  const base = resolvePublicApiBaseUrl();
  const source = ownerGameId
    ? `${base}/games/${encodeURIComponent(ownerGameId)}/cover/${game.coverVersion}`
    : `${base}/covers/${encodeURIComponent(game.slug)}/${game.coverVersion}`;
  const style = {
    aspectRatio: "16 / 9",
    "--game-cover-hue": coverHue(game.slug),
  } as CSSProperties;

  return (
    <div
      className={`game-cover game-cover--${size}`}
      data-testid={hasCover ? undefined : "game-cover-fallback"}
      style={style}
    >
      {hasCover ? (
        <img
          alt={`Ảnh bìa ${game.title}`}
          className="game-cover__image"
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
          src={source}
        />
      ) : (
        <div className="game-cover__fallback">
          <span className="game-cover__brand" aria-hidden="true">
            TFG
          </span>
          <strong>{initials(game.title)}</strong>
        </div>
      )}
    </div>
  );
}
