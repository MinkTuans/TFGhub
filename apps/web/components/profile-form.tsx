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
        "Use a display name with 2–50 characters and a bio up to 500 characters.",
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
          : "Unable to connect. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Display name
        <input
          name="displayName"
          minLength={2}
          maxLength={50}
          defaultValue={profile?.displayName ?? ""}
          required
        />
      </label>
      <label>
        Bio
        <textarea
          name="bio"
          maxLength={500}
          rows={3}
          defaultValue={profile?.bio ?? ""}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Profile saved.</p>}
      <button disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
