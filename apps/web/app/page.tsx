import Link from "next/link";

export default function Home() {
  return (
    <main className="hero">
      <p className="eyebrow">A home for small games</p>
      <h1>Every great game starts with a small idea.</h1>
      <p>
        Find something new to love, or start your next game in your own studio.
      </p>
      <div className="actions">
        <Link className="button" href="/discover">
          Explore games
        </Link>
        <Link href="/register">Create an account</Link>
      </div>
    </main>
  );
}
