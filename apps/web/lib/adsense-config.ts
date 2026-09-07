export type AdSlotName = "gameLeftTop" | "gameLeftBottom";

type DisabledAdsenseConfig = {
  enabled: false;
};

type EnabledAdsenseConfig = {
  enabled: true;
  client: string;
  slots: Record<AdSlotName, string>;
};

export type AdsenseConfig = DisabledAdsenseConfig | EnabledAdsenseConfig;

const publisherClient = /^ca-pub-\d+$/;
const numericSlot = /^\d+$/;

export function adsenseConfig(): AdsenseConfig {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const gameLeftTop = process.env.NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT;
  const gameLeftBottom = process.env.NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT;

  if (
    process.env.NEXT_PUBLIC_ADSENSE_ENABLED !== "true" ||
    !client ||
    !publisherClient.test(client) ||
    !gameLeftTop ||
    !numericSlot.test(gameLeftTop) ||
    !gameLeftBottom ||
    !numericSlot.test(gameLeftBottom)
  ) {
    return { enabled: false };
  }

  return {
    enabled: true,
    client,
    slots: { gameLeftTop, gameLeftBottom },
  };
}
