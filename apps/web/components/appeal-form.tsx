"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api-client";

export function AppealForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = String(
      new FormData(event.currentTarget).get("message") ?? "",
    );
    if (message.trim().length < 8) {
      setError("Explain the appeal in at least 8 characters.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await api.post(`/moderation/reports/${id}/appeal`, { message });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to appeal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Appeal
        <textarea name="message" minLength={8} rows={3} required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{pending ? "Sending…" : "Appeal quarantine"}</button>
    </form>
  );
}
