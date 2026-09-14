"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CreateDonationInput,
  type DonationSummary,
} from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function DonateForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<DonationSummary | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(
      (event.currentTarget.elements.namedItem("amount") as HTMLInputElement)
        .value,
    );
    const input = CreateDonationInput.safeParse({
      amountCents: Math.round(amount * 100),
      idempotencyKey: crypto.randomUUID(),
    });
    if (!input.success) {
      setError("Enter at least $1.00 (sandbox USD).");
      return;
    }
    setError("");
    setPending(true);
    try {
      const created = await api.post<DonationSummary>(
        `/games/${slug}/donations`,
        input.data,
      );
      const paid = await api.post<DonationSummary>(
        `/donations/${created.id}/sandbox-pay`,
        {},
      );
      setReceipt(paid);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to complete this sandbox donation.",
      );
    } finally {
      setPending(false);
    }
  }

  if (receipt?.status === "SUCCEEDED") {
    return (
      <p className="badge" role="status">
        Thanks — ${((receipt.netCents + receipt.feeCents) / 100).toFixed(2)} sent
        (platform fee ${(receipt.feeCents / 100).toFixed(2)} USD).
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Sandbox donation (USD)
        <input
          name="amount"
          type="number"
          min="1"
          max="1000"
          step="0.01"
          defaultValue="5"
          required
        />
      </label>
      <p className="hint">
        Test payments only. A 10% platform fee is taken; the rest goes to the
        creator. Completes exactly once.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending ? "Sending…" : "Send sandbox donation"}
      </button>
    </form>
  );
}
