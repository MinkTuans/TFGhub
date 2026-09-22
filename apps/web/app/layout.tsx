import type { Metadata } from "next";
import Link from "next/link";
import { AdsenseScript } from "../components/adsense-script";
import { SiteFooter } from "../components/site-footer";
import { SiteNavigation } from "../components/site-navigation";
import { TfgLogo } from "../components/tfg-logo";
import { ThemeToggle } from "../components/theme-toggle";
import { optionalSession } from "../lib/session";
import { MobileNavigation } from "../components/mobile-navigation";
import { DemoIntroduction } from "../components/demo-introduction";
import "./globals.css";
import "./reference-world.css";
import "./creator-reference.css";

export const metadata: Metadata = {
  title: "TFG — Nền tảng trò chơi độc lập",
  description: "Khám phá, sáng tạo và chia sẻ trò chơi độc lập cùng TFG.",
};

const themeBootstrap = `(() => {
  try {
    const theme = localStorage.getItem("tfg-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch {
    document.documentElement.removeAttribute("data-theme");
  }
})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await optionalSession();

  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/be-vietnam-pro-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/lora-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <AdsenseScript />
        <header className="site-header">
          <div className="site-header__inner container">
            <Link aria-label="TFG — Trang chủ" className="brand" href="/">
              <TfgLogo compact /><span className="brand-wordmark">TFG<span>trò chơi nhỏ · thế giới lớn</span></span>
            </Link>
            <div className="site-header__actions">
              <SiteNavigation session={session} />
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
        <SiteFooter session={session} />
        <MobileNavigation authenticated={!!session} />
        <DemoIntroduction />
      </body>
    </html>
  );
}
