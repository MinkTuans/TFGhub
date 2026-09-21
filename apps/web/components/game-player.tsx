"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameScoreResult, PlaySession } from "@indieforge/contracts";
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

function postScoreState(frame: Window | null, current: PlaySession | null) {
  if (frame && current) frame.postMessage({ type: "tfg:score-state", personalBest: current.personalBest }, "*");
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
  const flushScore = useRef<(keepalive?: boolean) => void>(() => {});
  const path = slug ? `/engagement/games/${encodeURIComponent(slug)}/plays` : "";

  async function frameLoaded() {
    if (!slug) return;
    if (started.current) {
      postScoreState(frameRef.current?.contentWindow ?? null, session.current);
      return;
    }
    started.current = true;
    try {
      const value = await telemetry<PlaySession>(path, { requestId: createPlayRequestId() });
      if (!mounted.current) return;
      session.current = value;
      postScoreState(frameRef.current?.contentWindow ?? null, value);
      flushScore.current();
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
    const saveScore = (keepalive = false) => {
      const current = session.current, score = bestScore.current;
      if (!current?.scoresEnabled || score === null || (scoreBusy.current && !keepalive) ||
        (submittedScore.current !== null && score <= submittedScore.current)) return;
      if (!keepalive) scoreBusy.current = true;
      let accepted = false;
      void telemetry<GameScoreResult>(`${path}/${encodeURIComponent(current.playId)}/score`, {
        token: current.token, score,
      }, "POST", keepalive).then(result => {
        accepted = true;
        submittedScore.current = Math.max(submittedScore.current ?? 0, score);
        // Unload saves can finish before older requests. Never regress their acknowledgement.
        if (result.personalBest !== null) current.personalBest = Math.max(current.personalBest ?? 0, result.personalBest);
        if (mounted.current) {
          postScoreState(frameRef.current?.contentWindow ?? null, current);
          window.dispatchEvent(new CustomEvent("tfg:engagement-change", { detail: { slug } }));
        }
      }).catch(() => {}).finally(() => {
        if (!keepalive) {
          scoreBusy.current = false;
          if (accepted && mounted.current) saveScore();
        }
      });
    };
    flushScore.current = saveScore;
    const hide = () => {
      record(clock.current.pause(performance.now()), true);
      saveScore(true);
    };
    const message = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      if (frame && event.source === frame && event.data?.type === "tfg:score-ready") {
        postScoreState(frame, session.current);
      }
      const score = readGameScore(event, frame);
      if (score !== null) {
        bestScore.current = Math.max(bestScore.current ?? 0, score);
        saveScore();
      }
    };
    const heartbeat = window.setInterval(() => {
      activity();
      if (visible()) record(clock.current.take(performance.now()));
    }, 15000);
    // Retry failures without a tight loop; successful writes drain the coalesced best immediately.
    const scores = window.setInterval(() => saveScore(), 1000);
    document.addEventListener("visibilitychange", activity);
    window.addEventListener("focus", activity);
    window.addEventListener("blur", activity);
    window.addEventListener("pagehide", hide);
    window.addEventListener("message", message);
    return () => {
      mounted.current = false; hide();
      flushScore.current = () => {};
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
      <div ref={stageRef} className="game-player__stage" style={{ "--player-ratio": ratio } as CSSProperties}>
        <div
          className="game-player__fit"
          style={{
            "--player-ratio": ratio,
            "--player-fit-width": fit ? `${fit.width}px` : undefined,
            "--player-fit-height": fit ? `${fit.height}px` : undefined,
          } as CSSProperties}
        >
          {launched ? <iframe ref={frameRef} onLoad={() => { void frameLoaded(); }} title={`Chơi ${title}`} src={src} sandbox="allow-scripts allow-pointer-lock" /> : (
            <div className="game-player__waiting" aria-hidden="true" />
          )}
        </div>
      </div>
      <div className="game-player__toolbar">
        <h1>{title}</h1>
        <div className="game-player__actions">
          {!launched && <button type="button" onClick={() => setLaunched(true)}>Bắt đầu chơi</button>}
          <button type="button" onClick={toggleFullscreen}>
            {fullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"}
          </button>
        </div>
      </div>
      {!launched && <p className="game-player__hint hint">Lượt chơi được ghi nhận khi bạn mở game.</p>}
      {error && <p className="game-player__error" role="status">{error}</p>}
    </section>
  );
}
