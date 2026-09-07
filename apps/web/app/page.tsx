import Link from "next/link";
import type { DiscoverGamesResponse } from "@indieforge/contracts";
import { FeatureIcon, type FeatureIconName } from "../components/feature-icon";
import { GameCard } from "../components/game-card";
import { api } from "../lib/api-client";

const creationMethods: Array<{
  icon: FeatureIconName;
  title: string;
  description: string;
}> = [
  {
    icon: "archive",
    title: "ZIP HTML5",
    description: "Đưa game HTML5 có sẵn của bạn lên TFG.",
  },
  {
    icon: "code",
    title: "Code",
    description: "Viết một game nhỏ trực tiếp trong trình duyệt.",
  },
  {
    icon: "story",
    title: "Truyện & quiz",
    description: "Kể câu chuyện tương tác với lựa chọn của người chơi.",
  },
  {
    icon: "platformer",
    title: "Platformer",
    description: "Dựng màn chơi bằng công cụ kéo thả đơn giản.",
  },
];

const publishingSteps = ["1. Tạo game", "2. Xem trước", "3. Gửi duyệt"];

export default async function Home() {
  let featuredGames: DiscoverGamesResponse["games"] | undefined;
  try {
    featuredGames = (await api.get<DiscoverGamesResponse>("/discover?limit=4")).games;
  } catch {
    // Creator tools are still useful while public discovery is unavailable.
  }

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">Dành cho người sáng tạo</p>
        <h1 id="home-title">Tạo, thử và phát hành game ngay trên trình duyệt.</h1>
        <p className="home-hero__lede">
          Biến ý tưởng nhỏ thành game để mọi người cùng khám phá trên TFG.
        </p>
        <div className="actions">
          <Link className="button" href="/studio">
            Mở Studio
          </Link>
          <Link className="button button-ghost" href="/discover">
            Khám phá game
          </Link>
        </div>
      </section>

      <section aria-labelledby="creation-methods-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bắt đầu theo cách của bạn</p>
            <h2 id="creation-methods-title">Tạo game theo cách của bạn</h2>
          </div>
        </div>
        <div className="feature-grid">
          {creationMethods.map((method) => (
            <article className="feature-card" key={method.title}>
              <FeatureIcon name={method.icon} />
              <h3>{method.title}</h3>
              <p>{method.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="publishing-process" aria-labelledby="publishing-steps-title">
        <p className="eyebrow">Quy trình đơn giản</p>
        <h2 id="publishing-steps-title">Từ ý tưởng đến game công khai</h2>
        <ol>
          {publishingSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      {featuredGames && featuredGames.length > 0 && (
        <section aria-labelledby="featured-games-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Từ cộng đồng TFG</p>
              <h2 id="featured-games-title">Game nổi bật</h2>
            </div>
            <Link href="/discover">Xem tất cả game</Link>
          </div>
          <div className="grid">
            {featuredGames.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
