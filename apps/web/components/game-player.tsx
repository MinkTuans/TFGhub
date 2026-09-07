"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export function GamePlayer({
  title,
  src,
  viewportWidth,
  viewportHeight,
}: {
  title: string;
  src: string;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const playerRef = useRef<HTMLElement>(null);
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
          <iframe title={`Chơi ${title}`} src={src} scrolling="no" sandbox="allow-scripts allow-pointer-lock" />
        </div>
      </div>
    </section>
  );
}
