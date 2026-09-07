import Script from "next/script";
import { adsenseConfig } from "../lib/adsense-config";

export function AdsenseScript() {
  const config = adsenseConfig();

  if (!config.enabled) return null;

  return (
    <Script
      async
      crossOrigin="anonymous"
      id="adsense-script"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.client}`}
      strategy="afterInteractive"
    />
  );
}
