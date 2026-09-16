import Link from "next/link";
import type { DiscoverGamesResponse } from "@indieforge/contracts";
import { FeatureIcon, type FeatureIconName } from "../components/feature-icon";
import { EmptyState } from "../components/empty-state";
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
  let recentGames: DiscoverGamesResponse["games"] | undefined;
  try {
    recentGames = (await api.get<DiscoverGamesResponse>("/discover?limit=4")).games;
  } catch {
    // Creator tools are still useful while public discovery is unavailable.
  }

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <p className="eyebrow" lang="en">A HOME FOR SMALL GAMES</p>
          <h1 id="home-title" lang="en">Every great game starts with a small idea.</h1>
          <p className="home-hero__lede">
            Khám phá những game độc lập, gặp gỡ ý tưởng mới và biến câu chuyện của bạn
            thành một trò chơi. Một không gian chung cho người chơi và người sáng tạo.
          </p>
          <div className="actions">
            <Link className="button" href="/discover">Khám phá game</Link>
            <Link className="button button-ghost" href="/register">Tạo tài khoản</Link>
          </div>
        </div>

      </section>

      <section className="home-community" aria-labelledby="recent-games-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Được tạo bởi cộng đồng độc lập</p>
            <h2 id="recent-games-title">Game mới trên TFG</h2>
          </div>
          <Link href="/discover">Xem tất cả game</Link>
        </div>
        {recentGames === undefined ? (
          <div role="alert">
            <p>Không thể tải game lúc này. Bạn vẫn có thể khám phá các công cụ sáng tạo bên dưới.</p>
            <Link href="/">Thử tải lại</Link>
          </div>
        ) : recentGames.length === 0 ? (
          <EmptyState title="Chưa có game công khai" description="Những ý tưởng đầu tiên đang chờ được chia sẻ. Bắt đầu với một bản nháp trong Studio của bạn.">
            <Link href="/studio/games/new">Tạo game đầu tiên</Link>
          </EmptyState>
        ) : (
          <div className="grid catalog-grid">
            {recentGames.map((game) => <GameCard key={game.slug} game={game} headingLevel={3} />)}
          </div>
        )}
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

      <section className="home-creator-invite">
        <aside className="home-hero__studio" aria-labelledby="home-studio-title">
          <div className="home-hero__studio-heading">
            <FeatureIcon name="code" />
            <span className="eyebrow">Không gian sáng tạo của bạn</span>
          </div>
          <h2 id="home-studio-title">Một ý tưởng nhỏ.<br />Rất nhiều cách bắt đầu.</h2>
          <p>Tạo bản nháp, thử cách chơi và chia sẻ khi bạn đã sẵn sàng.</p>
          <ol className="home-hero__notes">
            <li><span aria-hidden="true">01</span> Viết code hoặc kể một câu chuyện</li>
            <li><span aria-hidden="true">02</span> Thử nghiệm ngay trên trình duyệt</li>
            <li><span aria-hidden="true">03</span> Gửi game để được duyệt công khai</li>
          </ol>
          <Link className="button button-ghost" href="/studio">Mở Studio</Link>
        </aside>
      </section>
    </main>
  );
}
