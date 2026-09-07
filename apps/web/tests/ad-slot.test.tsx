import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AdSlot } from "../components/ad-slot";
import { AdsenseScript } from "../components/adsense-script";
import { adsenseConfig } from "../lib/adsense-config";

vi.mock("next/script", () => ({
  default: ({ strategy, ...props }: React.ComponentProps<"script"> & { strategy?: string }) => {
    void strategy;
    return <script {...props} />;
  },
}));

const validEnvironment = {
  NEXT_PUBLIC_ADSENSE_ENABLED: "true",
  NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-1234567890",
  NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT: "1234567890",
  NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT: "9876543210",
};

function setAdsenseEnvironment(overrides: Partial<typeof validEnvironment>) {
  for (const [name, value] of Object.entries({ ...validEnvironment, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  ["disabled", { NEXT_PUBLIC_ADSENSE_ENABLED: "false" }],
  ["case-variant enabled flag", { NEXT_PUBLIC_ADSENSE_ENABLED: "TRUE" }],
  ["incomplete", { NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT: "" }],
  ["malformed publisher", { NEXT_PUBLIC_ADSENSE_CLIENT: "pub-1234567890" }],
  ["malformed slot", { NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT: "slot-9876543210" }],
])("keeps a %s configuration inert", (_description, overrides) => {
  setAdsenseEnvironment(overrides);

  expect(adsenseConfig()).toEqual({ enabled: false });

  const { container } = render(
    <>
      <AdsenseScript />
      <AdSlot label="Quảng cáo" slot="gameLeftTop" />
    </>,
  );

  expect(screen.getByText("Quảng cáo")).toBeVisible();
  expect(container.querySelector(".adsbygoogle")).not.toBeInTheDocument();
  expect(document.querySelector('script[src*="pagead2.googlesyndication.com"]')).not.toBeInTheDocument();
});

test("uses validated configuration for one AdSense script and ad slot markup", () => {
  setAdsenseEnvironment({});

  expect(adsenseConfig()).toEqual({
    enabled: true,
    client: "ca-pub-1234567890",
    slots: {
      gameLeftTop: "1234567890",
      gameLeftBottom: "9876543210",
    },
  });

  const { container } = render(
    <>
      <AdsenseScript />
      <AdSlot label="Quảng cáo" slot="gameLeftTop" />
    </>,
  );

  expect(document.querySelectorAll("#adsense-script")).toHaveLength(1);
  expect(document.querySelector("#adsense-script")).toHaveAttribute(
    "src",
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890",
  );
  expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute(
    "data-ad-client",
    "ca-pub-1234567890",
  );
  expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute(
    "data-ad-slot",
    "1234567890",
  );
  expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute(
    "data-ad-format",
    "auto",
  );
});
