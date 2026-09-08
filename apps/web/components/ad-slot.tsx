"use client";

import { useEffect, useRef } from "react";
import { adsenseConfig, type AdSlotName } from "../lib/adsense-config";

declare global {
  interface Window {
    adsbygoogle?: { push: (request: Record<string, never>) => unknown };
  }
}

export function AdSlot({ slot, label }: { slot: AdSlotName; label: string }) {
  const config = adsenseConfig();
  const initialized = useRef(false);

  useEffect(() => {
    if (!config.enabled || initialized.current) return;
    initialized.current = true;
    try {
      (window.adsbygoogle ??= new Array<Record<string, never>>()).push({});
    } catch {
      // A blocked or unavailable ad service must not interrupt the game.
    }
  }, [config.enabled]);

  if (!config.enabled) {
    return (
      <div aria-label={label} className="ad-slot ad-slot--placeholder">
        Quảng cáo
      </div>
    );
  }

  return (
    <ins
      aria-label={label}
      className="adsbygoogle"
      data-ad-client={config.client}
      data-ad-format="auto"
      data-ad-slot={config.slots[slot]}
      style={{ display: "block" }}
    />
  );
}
