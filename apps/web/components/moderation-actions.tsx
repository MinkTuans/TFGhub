"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "../lib/api-client";

export function ModerationActions({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("Reviewed by a moderator");
  const [error, setError] = useState("");

  async function act(path: string) {
    setError("");
    try {
      await api.post(path, { reason });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to update this report.",
      );
    }
  }

  return (
    <div className="form-stack">
      <label>
        Reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={4}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => act(`/moderation/reports/${id}/quarantine`)}>
          Quarantine
        </button>
        <button type="button" onClick={() => act(`/moderation/reports/${id}/dismiss`)}>
          Dismiss
        </button>
        <button type="button" onClick={() => act(`/moderation/reports/${id}/restore`)}>
          Restore
        </button>
      </div>
    </div>
  );
}
