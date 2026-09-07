import type { Metadata } from "next";
import Link from "next/link";
import { SiteNavigation } from "../components/site-navigation";
import { TfgLogo } from "../components/tfg-logo";
import { ThemeToggle } from "../components/theme-toggle";
import { optionalSession } from "../lib/session";
import "./globals.css";

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
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header__inner container">
            <Link aria-label="TFG — Trang chủ" className="brand" href="/">
              <TfgLogo compact />
            </Link>
            <div className="site-header__actions">
              <SiteNavigation session={session} />
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
        <footer>TFG — Không gian cho người chơi và nhà sáng tạo độc lập.</footer>
      </body>
    </html>
  );
}
