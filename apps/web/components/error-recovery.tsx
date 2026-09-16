"use client";

import { FeatureIcon } from "./feature-icon";

export type ErrorRecoveryProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export function ErrorRecovery({ retry }: ErrorRecoveryProps) {
  return (
    <main className="narrow error-recovery">
      <FeatureIcon name="archive" />
      <p className="eyebrow">Tạm thời không khả dụng</p>
      <h1>Không thể tải trang lúc này</h1>
      <p>Vui lòng thử lại. Nếu vẫn chưa kết nối được, bạn có thể quay về trang chủ.</p>
      <div className="actions">
        <button type="button" onClick={() => retry()}>Thử lại</button>
        {/* A full navigation also recovers when the root layout itself failed. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button button-ghost" href="/">Về trang chủ</a>
      </div>
    </main>
  );
}
