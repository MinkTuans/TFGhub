import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IndieForge — A home for small games",
  description: "Discover independent games and start your own game studio.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <Link href="/login">Log in</Link>
          </nav>
        </header>
        {children}
        <footer>Made for curious players and independent creators.</footer>
      </body>
    </html>
  );
}
