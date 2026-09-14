"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreateReportInput, type ReportSummary } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function ReportForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<ReportSummary | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = CreateReportInput.safeParse({
      category: form.get("category"),
      evidence: form.get("evidence"),
    });
    if (!input.success) {
      setError("Choose a category and describe the issue in at least 8 characters.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const report = await api.post<ReportSummary>(
        `/games/${slug}/reports`,
        input.data,
      );
      setDone(report);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to send this report.",
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="badge" role="status">
        Report received
        {done.moderationState === "QUARANTINED"
          ? " — this game is hidden pending review."
          : "."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <h2>Report this game</h2>
      <label>
        Category
        <select name="category" defaultValue="MISLEADING" required>
          <option value="MALWARE">Malware / unsafe software</option>
          <option value="PROHIBITED">Prohibited content</option>
          <option value="COPYRIGHT">Copyright</option>
          <option value="IMPERSONATION">Impersonation</option>
          <option value="MISLEADING">Misleading metadata</option>
        </select>
      </label>
      <label>
        Evidence
        <textarea name="evidence" minLength={8} rows={4} required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{pending ? "Sending…" : "Submit report"}</button>
    </form>
  );
}
