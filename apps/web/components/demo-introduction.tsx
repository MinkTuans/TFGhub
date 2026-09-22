"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const storageKey = "tfg-demo-introduction-seen";

type Feature = {
  icon: "discover" | "create" | "pixel" | "preview" | "moderation";
  title: string;
  description: string;
};

const features: Feature[] = [
  { icon: "discover", title: "Khám phá trò chơi", description: "Tìm các trò chơi độc lập đã được công khai." },
  { icon: "create", title: "4 cách tạo game", description: "Bắt đầu với HTML5, code, truyện hoặc vượt chướng ngại vật." },
  { icon: "pixel", title: "Tạo game Pixel trong Studio", description: "Thiết kế cảnh, luật chơi và tài nguyên ngay trên trình duyệt." },
  { icon: "preview", title: "Xem trước & gửi duyệt", description: "Kiểm tra bản chơi rồi gửi khi bạn đã sẵn sàng." },
  { icon: "moderation", title: "Kiểm duyệt rõ ràng", description: "Trò chơi được duyệt trước khi xuất hiện công khai." },
];

const slides = [
  { label: "Tổng quan", eyebrow: "Chào mừng đến với TFG", title: "Nền tảng trò chơi độc lập", description: "Khám phá, sáng tạo và chia sẻ những trò chơi nhỏ ngay trên web." },
  { label: "Tính năng chính", eyebrow: "Từ ý tưởng đến bản chơi", title: "Tính năng chính", description: "Mọi công cụ cốt lõi để bắt đầu và đưa trò chơi đến cộng đồng." },
  { label: "Quy trình sử dụng", eyebrow: "Một hành trình rõ ràng", title: "Biến ý tưởng thành trò chơi", description: "Bốn bước ngắn gọn, từ bản nháp đầu tiên đến khi mọi người có thể khám phá." },
  { label: "Kết thúc", eyebrow: "Bắt đầu hành trình", title: "Sẵn sàng khám phá?", description: "Tìm một trò chơi mới hoặc bắt đầu tạo câu chuyện của riêng bạn." },
] as const;

function Glyph({ name }: { name: Feature["icon"] | "spark" | "arrow" | "check" }) {
  const paths = {
    discover: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm4.5 4.5 3-3 3 2 4-5",
    create: "M4 5h16v14H4zM8 9h8M8 13h5M8 17h3",
    pixel: "M5 4h14v16H5zM9 8h2v2H9zm4 0h2v2h-2zM9 12h6v4H9z",
    preview: "M4 5h16v14H4zM10 9l5 3-5 3z",
    moderation: "M12 3 5 6v5c0 4.4 3 8.5 7 10 4-1.5 7-5.6 7-10V6l-7-3Zm-3 9 2 2 4-4",
    spark: "m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z",
    arrow: "m9 5 7 7-7 7",
    check: "m5 12 4 4L19 6",
  } as const;

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

export function DemoIntroduction() {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const slidesCount = slides.length;
  const current = slides[slide];

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(storageKey) !== "true");
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  function close() {
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // Browser storage may be unavailable; the introduction still closes for this page.
    }
    setOpen(false);
  }

  function move(next: number) {
    setSlide(Math.max(0, Math.min(slidesCount - 1, next)));
  }

  if (!open) return null;

  return (
    <div
      ref={dialog}
      aria-label="Giới thiệu TFG"
      aria-modal="true"
      className="demo-introduction"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(slide - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          move(slide + 1);
        }
      }}
      role="dialog"
      tabIndex={-1}
    >
      <section className="demo-introduction__panel">
        <div className="demo-introduction__topbar">
          <p className="demo-introduction__brand"><span aria-hidden="true">TFG</span> trò chơi nhỏ · thế giới lớn</p>
          <button aria-label="Đóng giới thiệu" className="demo-introduction__close button-ghost" onClick={close} type="button">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="demo-introduction__progress" aria-label={`Slide ${slide + 1} trên ${slidesCount}`}>
          <span>{String(slide + 1).padStart(2, "0")}</span>
          <span>{String(slidesCount).padStart(2, "0")}</span>
        </div>

        <div className="demo-introduction__content" key={current.label}>
          {slide === 0 && (
            <div className="demo-introduction__overview">
              <span className="demo-introduction__emblem"><Glyph name="spark" /></span>
              <p className="eyebrow">{current.eyebrow}</p>
              <h2 id="demo-introduction-title">{current.title}</h2>
              <p>{current.description}</p>
              <div className="demo-introduction__overview-line"><span>Khám phá</span><span>Tạo game</span><span>Chia sẻ</span></div>
            </div>
          )}

          {slide === 1 && (
            <>
              <p className="eyebrow">{current.eyebrow}</p>
              <h2 id="demo-introduction-title">{current.title}</h2>
              <p className="demo-introduction__lede">{current.description}</p>
              <div className="demo-introduction__features">
                {features.map((feature) => (
                  <article className="demo-introduction__feature" key={feature.title}>
                    <span className="demo-introduction__feature-icon"><Glyph name={feature.icon} /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </article>
                ))}
              </div>
            </>
          )}

          {slide === 2 && (
            <>
              <p className="eyebrow">{current.eyebrow}</p>
              <h2 id="demo-introduction-title">{current.title}</h2>
              <p className="demo-introduction__lede">{current.description}</p>
              <ol className="demo-introduction__flow">
                {["Chọn cách tạo", "Xây dựng trò chơi", "Xem trước & gửi duyệt", "Khám phá công khai"].map((step, index) => (
                  <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < 3 && <Glyph name="arrow" />}</li>
                ))}
              </ol>
            </>
          )}

          {slide === 3 && (
            <div className="demo-introduction__final">
              <span className="demo-introduction__emblem"><Glyph name="check" /></span>
              <p className="eyebrow">{current.eyebrow}</p>
              <h2 id="demo-introduction-title">{current.title}</h2>
              <p>{current.description}</p>
              <Link className="button" href="/discover" onClick={close}>Khám phá website <Glyph name="arrow" /></Link>
            </div>
          )}
        </div>

        <div className="demo-introduction__controls">
          <button className="button-ghost" disabled={slide === 0} onClick={() => move(slide - 1)} type="button">← Trước</button>
          <div aria-label="Chuyển slide" className="demo-introduction__indicators">
            {slides.map((item, index) => (
              <button aria-current={slide === index ? "step" : undefined} aria-label={`Slide ${index + 1}: ${item.label}`} key={item.label} onClick={() => move(index)} type="button">
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
          {slide === slidesCount - 1 ? (
            <Link className="button" href="/discover" onClick={close}>Khám phá website <Glyph name="arrow" /></Link>
          ) : (
            <button onClick={() => move(slide + 1)} type="button">Tiếp <span aria-hidden="true">→</span></button>
          )}
        </div>
      </section>
    </div>
  );
}
