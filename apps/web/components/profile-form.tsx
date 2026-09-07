"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DeveloperProfileInput } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export type Profile = { displayName: string; bio: string };

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = DeveloperProfileInput.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setSaved(false);
    if (!input.success) {
      setError(
        "Tên hiển thị cần có 2–50 ký tự; giới thiệu tối đa 500 ký tự.",
      );
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.put<Profile>("/developers/me", input.data);
      setSaved(true);
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
        Tên hiển thị
        <input
          name="displayName"
          minLength={2}
          maxLength={50}
          defaultValue={profile?.displayName ?? ""}
          required
        />
      </label>
      <label>
        Giới thiệu
        <textarea
          name="bio"
          maxLength={500}
          rows={3}
          defaultValue={profile?.bio ?? ""}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Đã lưu hồ sơ.</p>}
      <button disabled={pending}>{pending ? "Đang lưu…" : "Lưu hồ sơ"}</button>
    </form>
  );
}
