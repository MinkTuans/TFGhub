import { adsenseConfig, type AdSlotName } from "../lib/adsense-config";

export function AdSlot({ slot, label }: { slot: AdSlotName; label: string }) {
  const config = adsenseConfig();

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
