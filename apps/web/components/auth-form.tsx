"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoginInput, RegisterInput } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = (mode === "register" ? RegisterInput : LoginInput).safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!input.success) {
      setError("Nhập email hợp lệ và mật khẩu từ 10–128 ký tự.");
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.post(`/auth/${mode}`, input.data);
      router.replace("/studio");
      router.refresh();
    } catch (error) {
      setError(
        apiErrorMessage(
          error,
          mode === "register"
            ? "Không thể tạo tài khoản. Vui lòng thử lại."
            : "Không thể đăng nhập. Vui lòng thử lại.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="form-stack panel">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mật khẩu
        <input
          name="password"
          type="password"
          minLength={10}
          maxLength={128}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          required
        />
      </label>
      {mode === "register" && <p className="hint">Sử dụng ít nhất 10 ký tự.</p>}
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending
          ? "Vui lòng chờ…"
          : mode === "register"
            ? "Tạo tài khoản"
            : "Đăng nhập"}
      </button>
    </form>
  );
}
