import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AdSlot } from "../components/ad-slot";
import { AdsenseScript } from "../components/adsense-script";
import { adsenseConfig } from "../lib/adsense-config";
import { StrictMode } from "react";
import RootLayout from "../app/layout";

vi.mock("../lib/session", () => ({ optionalSession: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/games/tiny-quest",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

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
  Reflect.deleteProperty(window, "adsbygoogle");
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
  expect(container.innerHTML).not.toContain("adsbygoogle");
  expect(Reflect.get(window, "adsbygoogle")).toBeUndefined();
  expect(document.querySelector('script[src*="pagead2.googlesyndication.com"]')).not.toBeInTheDocument();
});

test("queues each enabled mounted slot once across strict effects, rerenders and navigation", () => {
  setAdsenseEnvironment({});
  const queue: Record<string, never>[] = [];
  Reflect.set(window, "adsbygoogle", queue);
  const { rerender, unmount } = render(<StrictMode><AdSlot label="Quảng cáo trên" slot="gameLeftTop" /></StrictMode>);
  expect(queue).toEqual([{}]);
  rerender(<StrictMode><AdSlot label="Quảng cáo mới" slot="gameLeftTop" /></StrictMode>);
  expect(queue).toEqual([{}]);
  unmount();
  render(<><AdSlot label="Quảng cáo trên" slot="gameLeftTop" /><AdSlot label="Quảng cáo dưới" slot="gameLeftBottom" /></>);
  expect(queue).toEqual([{}, {}, {}]);
});

test("initializes the queue before the enabled script has loaded", () => {
  setAdsenseEnvironment({});
  render(<AdSlot label="Quảng cáo" slot="gameLeftTop" />);
  expect(Reflect.get(window, "adsbygoogle")).toEqual([{}]);
});

test("retains the slot when the external ad queue rejects a request", () => {
  setAdsenseEnvironment({});
  Reflect.set(window, "adsbygoogle", { push: () => { throw new Error("Ad service unavailable"); } });
  expect(() => render(<AdSlot label="Quảng cáo" slot="gameLeftTop" />)).not.toThrow();
  expect(screen.getByLabelText("Quảng cáo")).toBeInTheDocument();
});

test.each(["false", "true"])("root layout keeps enabled=%s script singleton across child navigation", async (enabled) => {
  setAdsenseEnvironment({ NEXT_PUBLIC_ADSENSE_ENABLED: enabled });
  const first = await RootLayout({ children: <main><AdSlot label="Quảng cáo" slot="gameLeftTop" /></main> });
  const { rerender } = render(first, { container: document });
  expect(document.querySelectorAll("#adsense-script")).toHaveLength(enabled === "true" ? 1 : 0);
  rerender(await RootLayout({ children: <main>Khám phá game</main> }));
  expect(document.querySelectorAll("#adsense-script")).toHaveLength(enabled === "true" ? 1 : 0);
  if (enabled === "false") expect(document.documentElement.outerHTML).not.toContain("adsbygoogle");
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
