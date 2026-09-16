"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PlaySession } from "@indieforge/contracts";
import { resolveApiBaseUrl } from "../lib/api-client";
import { ActivePlayClock, createPlayRequestId, readGameScore } from "../lib/play-telemetry";

type PlayerProps = { title: string; src: string; slug?: string; viewportWidth: number; viewportHeight: number };
export function GamePlayer(props: PlayerProps) {
  return <PlayerSession key={`${props.src}:${props.slug ?? "preview"}`} {...props} />;
}

async function telemetry<T>(path: string, body: unknown, method = "POST", keepalive = false): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method, credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), keepalive,
  });
  if (!response.ok) throw new Error("Activity unavailable");
  return response.json() as Promise<T>;
}

function PlayerSession({
  title,
  src,
  slug,
  viewportWidth,
  viewportHeight,
}: PlayerProps) {
  const playerRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [launched, setLaunched] = useState(!slug);
  const started = useRef(false);
  const mounted = useRef(false);
  const session = useRef<PlaySession | null>(null);
  const clock = useRef(new ActivePlayClock());
  const sequence = useRef(0);
  const bestScore = useRef<number | null>(null);
  const submittedScore = useRef<number | null>(null);
  const scoreBusy = useRef(false);
  const path = slug ? `/engagement/games/${encodeURIComponent(slug)}/plays` : "";

  async function frameLoaded() {
    if (!slug || started.current) return;
    started.current = true;
    try {
      const value = await telemetry<PlaySession>(path, { requestId: createPlayRequestId() });
      if (!mounted.current) return;
      session.current = value;
      window.dispatchEvent(new CustomEvent("tfg:engagement-change", { detail: { slug } }));
      if (document.visibilityState === "visible" && document.hasFocus()) clock.current.resume(performance.now());
    } catch { /* Activity recording must never prevent playing. */ }
  }

  useEffect(() => {
    mounted.current = true;
    if (!slug) return () => { mounted.current = false; };
    const visible = () => document.visibilityState === "visible" && document.hasFocus();
    const record = (seconds: number, keepalive = false) => {
      const current = session.current;
      if (!current || seconds <= 0) return;
      void telemetry(`${path}/${encodeURIComponent(current.playId)}`, {
        token: current.token, sequence: ++sequence.current, activeSeconds: seconds,
      }, "PATCH", keepalive).catch(() => {});
    };
    const activity = () => {
      if (!session.current) return;
      if (visible()) clock.current.resume(performance.now());
      else record(clock.current.pause(performance.now()), true);
    };
    const hide = () => record(clock.current.pause(performance.now()), true);
    const message = (event: MessageEvent) => {
      const score = readGameScore(event, frameRef.current?.contentWindow ?? null);
      if (score !== null) bestScore.current = Math.max(bestScore.current ?? 0, score);
    };
    const heartbeat = window.setInterval(() => {
      activity();
      if (visible()) record(clock.current.take(performance.now()));
    }, 15000);
    // Coalesce game messages; the API retains only the highest score per play.
    const scores = window.setInterval(() => {
      const current = session.current, score = bestScore.current;
      if (!current?.scoresEnabled || score === null || scoreBusy.current ||
        (submittedScore.current !== null && score <= submittedScore.current)) return;
      scoreBusy.current = true;
      void telemetry(`${path}/${encodeURIComponent(current.playId)}/score`, { token: current.token, score })
        .then(() => { submittedScore.current = score; if (mounted.current) window.dispatchEvent(new CustomEvent("tfg:engagement-change", { detail: { slug } })); }).catch(() => {})
        .finally(() => { scoreBusy.current = false; });
    }, 1000);
    document.addEventListener("visibilitychange", activity);
    window.addEventListener("focus", activity);
    window.addEventListener("blur", activity);
    window.addEventListener("pagehide", hide);
    window.addEventListener("message", message);
    return () => {
      mounted.current = false; hide();
      window.clearInterval(heartbeat); window.clearInterval(scores);
      document.removeEventListener("visibilitychange", activity);
      window.removeEventListener("focus", activity); window.removeEventListener("blur", activity);
      window.removeEventListener("pagehide", hide); window.removeEventListener("message", message);
    };
  }, [slug, path]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [fit, setFit] = useState<{ width: number; height: number }>();
  const ratio = Number.isFinite(viewportWidth) && viewportWidth > 0 &&
    Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportWidth / viewportHeight
    : 16 / 9;

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(0, Math.min(entry.contentRect.width, entry.contentRect.height * ratio));
      setFit({ width, height: width / ratio });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ratio]);

  async function toggleFullscreen() {
    setError("");
    try {
      if (document.fullscreenElement === playerRef.current) {
        await document.exitFullscreen();
      } else {
        await playerRef.current!.requestFullscreen();
      }
    } catch {
      setError("Không thể mở toàn màn hình trên trình duyệt này.");
    }
  }

  return (
    <section ref={playerRef} className="game-player" aria-label={`Chơi ${title}`}>
      <div className="game-player__toolbar">
        <h1>{title}</h1>
        <button type="button" onClick={toggleFullscreen}>
          {fullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"}
        </button>
      </div>
      {error && <p className="game-player__error" role="status">{error}</p>}
      <div ref={stageRef} className="game-player__stage">
        <div
          className="game-player__fit"
          style={{ "--player-ratio": ratio, aspectRatio: String(ratio), ...fit } as CSSProperties}
        >
          {launched ? <iframe ref={frameRef} onLoad={() => { void frameLoaded(); }} title={`Chơi ${title}`} src={src} scrolling="no" sandbox="allow-scripts allow-pointer-lock" /> : (
            <div style={{ display: "grid", placeContent: "center", height: "100%", minHeight: 160, padding: "1rem", textAlign: "center" }}>
              <button type="button" onClick={() => setLaunched(true)}>Bắt đầu chơi</button>
              <p className="hint" style={{ margin: ".75rem 0 0", lineHeight: 1.5 }}>Lượt chơi được ghi nhận khi bạn mở game.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
