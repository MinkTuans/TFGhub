"use client";

import { useState } from "react";
import { CreateEngineGame } from "./create-engine-game";
import { GameForm } from "./game-form";

export function GameCreationPaths() {
  const [path, setPath] = useState<"ENGINE" | "UPLOAD" | null>(null);
  return (
    <>
      <div className="field-grid" aria-label="Chọn cách tạo game">
        <section className="panel">
          <h2>Tải game HTML5/ZIP</h2>
          <p>Chuẩn bị game HTML5 trong tệp ZIP tối đa 100 MiB, có index.html ở thư mục gốc.</p>
          <button type="button" aria-pressed={path === "UPLOAD"} aria-controls="creation-form" onClick={() => setPath("UPLOAD")}>
            Tải game HTML5/ZIP
          </button>
        </section>
        <section className="panel">
          <h2>Tạo game Pixel</h2>
          <p>Bắt đầu với mẫu chơi được ngay hoặc cảnh trống, không cần chuẩn bị tệp game.</p>
          <button type="button" aria-pressed={path === "ENGINE"} aria-controls="creation-form" onClick={() => setPath("ENGINE")}>
            Tạo game Pixel
          </button>
        </section>
      </div>
      <div id="creation-form">
        {path === "ENGINE" && <section aria-label="Tạo game Pixel">
          <h2>Đặt tên và chọn điểm bắt đầu</h2>
          <CreateEngineGame />
        </section>}
        {path === "UPLOAD" && <section aria-label="Tải game HTML5/ZIP">
          <h2>Tạo bản nháp để tải game lên</h2>
          <p>Sau khi tạo, mở trò chơi trong Xưởng sáng tạo để tải tệp ZIP và chơi thử. Bạn cũng có thể chọn các cách tạo trước đây trong biểu mẫu.</p>
          <GameForm />
        </section>}
      </div>
    </>
  );
}
