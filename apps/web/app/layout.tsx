import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "../components/logout-button";
import { optionalSession } from "../lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "IndieForge — A home for small games",
  description: "Discover independent games and start your own game studio.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await optionalSession();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            IndieForge
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/discover">Discover</Link>
            <Link href="/studio">Studio</Link>
            {session ? (
              <>
                <Link href="/profile" lang="vi">
                  Thông tin cá nhân
                </Link>
                {(session.role === "MODERATOR" || session.role === "ADMIN") && (
                  <Link href="/moderation">Moderation</Link>
                )}
                <LogoutButton />
              </>
            ) : (
              <Link href="/login">Log in</Link>
            )}
          </nav>
        </header>
        {children}
        <footer>Made for curious players and independent creators.</footer>
      </body>
    </html>
  );
}
