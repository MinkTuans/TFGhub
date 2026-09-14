"use client";

import { useEffect } from "react";
import { api } from "../lib/api-client";

const VISITOR_KEY = "indieforge_visitor";

function visitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, created);
  return created;
}

export function PlayBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    let sessionId = "";
    let lastInput = Date.now();
    const onInput = () => {
      lastInput = Date.now();
    };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);

    const start = api
      .post<{ id: string }>("/analytics/sessions", {
        visitorId: visitorId(),
        gameSlug: slug,
      })
      .then((session) => {
        sessionId = session.id;
      })
      .catch(() => undefined);

    const timer = window.setInterval(() => {
      if (!sessionId) return;
      const visible = document.visibilityState === "visible";
      const active = Date.now() - lastInput < 30_000;
      void api
        .post(`/analytics/sessions/${sessionId}/heartbeats`, {
          eventId: crypto.randomUUID(),
          visible,
          active,
          occurredAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }, 15_000);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      void start;
    };
  }, [slug]);
  return null;
}
