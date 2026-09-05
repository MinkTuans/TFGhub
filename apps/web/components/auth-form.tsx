"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoginInput, RegisterInput } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

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
      setError("Enter a valid email and a password with 10–128 characters.");
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
        error instanceof ApiError
          ? error.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
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
      {mode === "register" && (
        <p className="hint">Use at least 10 characters.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending
          ? "Please wait…"
          : mode === "register"
            ? "Create account"
            : "Log in"}
      </button>
    </form>
  );
}
