"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    setPending(true);
    try {
      await api.post("/auth/logout", {});
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Không thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="nav-button button-ghost"
        disabled={pending}
        lang="vi"
        onClick={logout}
      >
        {pending ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
      {error && (
        <span className="nav-error" lang="vi" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
