"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateEngineGameResponse } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

export function CreateEngineGame() {
  const router = useRouter();
  const creating = useRef(false);
  const [title, setTitle] = useState("Đảo của tôi");
  const [template, setTemplate] = useState<"PIXEL_ADVENTURE" | "BLANK">(
    "PIXEL_ADVENTURE",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (creating.current || !title.trim()) return;
    creating.current = true;
    setPending(true);
    setError("");
    try {
      const { game } = await api.post<CreateEngineGameResponse>(
        "/games/engine-projects",
        { title: title.trim(), template },
      );
      router.replace("/studio/games/" + game.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        apiErrorMessage(error, "Không thể tạo bản nháp. Vui lòng thử lại."),
      );
      creating.current = false;
      setPending(false);
    }
  }

  return (
    <form
      className="form-stack panel"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label>
        Tên trò chơi
        <input
          required
          maxLength={80}
          value={title}
          disabled={pending}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <fieldset disabled={pending}>
        <legend>Chọn điểm bắt đầu</legend>
        <label className="studio-template-choice">
          <input
            type="radio"
            name="template"
            value="PIXEL_ADVENTURE"
            checked={template === "PIXEL_ADVENTURE"}
            onChange={() => setTemplate("PIXEL_ADVENTURE")}
          />
          <strong>Đảo Đom Đóm · Pixel Adventure</strong>
          <span>
            Khuyên dùng — mẫu chơi được ngay: thu thập pha lê, tránh chướng ngại
            và tìm lối ra. Tự do sửa cảnh, ảnh và code.
          </span>
        </label>
        <label className="studio-template-choice">
          <input
            type="radio"
            name="template"
            value="BLANK"
            checked={template === "BLANK"}
            onChange={() => setTemplate("BLANK")}
          />
          <strong>Dự án 2D trống</strong>
          <span>Một cảnh trống để tự xây từ đầu.</span>
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending || !title.trim()}>
        {pending ? "Đang tạo…" : "Tạo bản nháp"}
      </button>
    </form>
  );
}
