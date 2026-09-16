"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DeveloperProfileInput, LoginInput, RegisterInput } from "@indieforge/contracts";
import { api } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";
import { PasswordField } from "./password-field";

const passwordHint = "Mật khẩu cần có 8–128 ký tự, gồm chữ thường, chữ hoa, số và ký tự đặc biệt.";

type RegistrationProfile = { displayName: string; bio: string };

export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const router = useRouter();
  const hintId = useId();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  // Retain only the profile for retries; never repeat a successful registration.
  const [createdProfile, setCreatedProfile] = useState<RegistrationProfile | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    let profile = createdProfile;
    let credentials: { email: string; password: string } | undefined;
    if (!createdProfile) {
      const raw = Object.fromEntries(new FormData(event.currentTarget));
      const input = (mode === "register" ? RegisterInput : LoginInput).safeParse(raw);
      if (!input.success) {
        setError(`Nhập thư điện tử hợp lệ. ${passwordHint}`);
        return;
      }
      credentials = input.data;
      if (mode === "register") {
        if (raw.confirmPassword !== credentials.password) {
          setError("Mật khẩu xác nhận chưa khớp.");
          return;
        }
        const details = DeveloperProfileInput.safeParse({ displayName: raw.displayName });
        if (!details.success) {
          setError("Tên hiển thị cần có 2–50 ký tự.");
          return;
        }
        profile = details.data;
      }
    }
    setError("");
    busy.current = true;
    setPending(true);
    let accountCreated = createdProfile !== null;
    try {
      if (!accountCreated) {
        await api.post(`/auth/${mode}`, credentials);
        if (profile) {
          accountCreated = true;
          setCreatedProfile(profile);
        }
      }
      if (profile) await api.put("/developers/me", profile);
      router.replace("/studio");
      router.refresh();
    } catch (failure) {
      setError(apiErrorMessage(failure, accountCreated
        ? "Không thể lưu hồ sơ. Tài khoản đã được tạo; hãy thử lưu hồ sơ lại."
        : mode === "register" ? "Không thể tạo tài khoản. Vui lòng thử lại." : "Không thể đăng nhập. Vui lòng thử lại."));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="form-stack auth-form" aria-busy={pending}>
      {createdProfile ? (
        <>
          <p role="status">Tài khoản đã được tạo. {pending ? "Đang lưu hồ sơ của bạn…" : "Bạn có thể tiếp tục hoàn thiện hồ sơ."}</p>
          <p>Tên hiển thị: <strong>{createdProfile.displayName}</strong></p>
        </>
      ) : (
        <>
          {mode === "register" && <label>Tên hiển thị<input name="displayName" autoComplete="nickname" minLength={2} maxLength={50} disabled={pending} required /></label>}
          <label>Thư điện tử<input name="email" type="email" autoComplete="email" disabled={pending} required /></label>
          <PasswordField name="password" label="Mật khẩu" autoComplete={mode === "register" ? "new-password" : "current-password"} disabled={pending} describedBy={hintId} />
          <p className="hint" id={hintId}>{passwordHint}</p>
          {mode === "register" && <>
            <PasswordField name="confirmPassword" label="Xác nhận mật khẩu" autoComplete="new-password" disabled={pending} />
          </>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Vui lòng chờ…" : createdProfile ? "Thử lưu hồ sơ" : mode === "register" ? "Tạo tài khoản" : "Đăng nhập"}</button>
      {createdProfile && !pending && <Link href="/profile">Đi đến hồ sơ của bạn</Link>}
    </form>
  );
}
