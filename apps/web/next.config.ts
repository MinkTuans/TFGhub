import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ADSENSE_ENABLED: process.env.NEXT_PUBLIC_ADSENSE_ENABLED ?? "false",
    NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "",
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT:
      process.env.NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT ?? "",
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT:
      process.env.NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT ?? "",
  },
};

export default nextConfig;
