"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreateGameInput, type GameSummary } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function GameForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = CreateGameInput.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!input.success) {
      setError(
        "Kiểm tra tên game, đường dẫn, mô tả, quyền truy cập và kích thước hiển thị.",
      );
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.post<GameSummary>("/games", input.data);
      router.replace("/studio");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        error instanceof ApiError
          ? error.message
          : "Không thể kết nối. Vui lòng thử lại.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack panel">
      <label>
        Tên game
        <input name="title" maxLength={80} required />
      </label>
      <label>
        Đường dẫn
        <input
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby="slug-help"
          required
        />
      </label>
      <p className="hint" id="slug-help">
        Dùng chữ thường, số và dấu gạch nối, ví dụ tiny-quest.
      </p>
      <label>
        Mô tả
        <textarea name="description" maxLength={2000} rows={5} />
      </label>
      <label>
        Quyền truy cập
        <select name="accessMode" defaultValue="GUEST_ALLOWED">
          <option value="GUEST_ALLOWED">Cho phép khách chơi</option>
          <option value="AUTH_REQUIRED">Yêu cầu tài khoản</option>
        </select>
      </label>
      <label>
        Cách tạo game
        <select name="sourceType" defaultValue="UPLOAD">
          <option value="UPLOAD">Tải tệp ZIP HTML5</option>
          <option value="CODE">Lập trình</option>
          <option value="STORY">Cốt truyện</option>
          <option value="PLATFORMER">Đi cảnh</option>
        </select>
      </label>
      <fieldset className="field-grid">
        <legend>Kích thước hiển thị</legend>
        <label>
          Chiều rộng hiển thị
          <input
            name="viewportWidth"
            type="number"
            min={1}
            max={4096}
            step={1}
            defaultValue={16}
            required
          />
        </label>
        <label>
          Chiều cao hiển thị
          <input
            name="viewportHeight"
            type="number"
            min={1}
            max={4096}
            step={1}
            defaultValue={9}
            required
          />
        </label>
      </fieldset>
      <p className="hint">Tỷ lệ khung chơi, ví dụ 16 × 9 hoặc 4 × 3.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending ? "Đang tạo…" : "Tạo bản nháp"}
      </button>
    </form>
  );
}
