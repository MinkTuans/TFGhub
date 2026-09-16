import type { ReactNode } from "react";
import { FeatureIcon } from "./feature-icon";

export function AuthLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-story" aria-labelledby="auth-story-title">
        <p className="eyebrow">Không gian sáng tạo độc lập</p>
        <h2 id="auth-story-title">Ý tưởng nhỏ.<br />Khởi đầu của một game mới.</h2>
        <p>Một nơi để chơi, thử nghiệm và chia sẻ những điều bạn tạo ra.</p>
        <ul>
          <li><FeatureIcon name="platformer" /><span>Khám phá game từ cộng đồng.</span></li>
          <li><FeatureIcon name="code" /><span>Tạo bản nháp theo cách của bạn.</span></li>
          <li><FeatureIcon name="story" /><span>Đưa câu chuyện của bạn đến người chơi.</span></li>
        </ul>
      </aside>
      <section className="auth-panel" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        <p className="auth-panel__intro">{intro}</p>
        {children}
      </section>
    </main>
  );
}
