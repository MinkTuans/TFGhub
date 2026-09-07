"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreateGameInput, type GameSummary } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";

export function GameForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = CreateGameInput.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!input.success) {
      setError("Check your title, slug, description, and access mode.");
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.post<GameSummary>("/games", input.data);
      router.replace("/studio");
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
        Title
        <input name="title" maxLength={80} required />
      </label>
      <label>
        Slug
        <input
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby="slug-help"
          required
        />
      </label>
      <p className="hint" id="slug-help">
        Use lowercase letters, numbers, and hyphens, for example tiny-quest.
      </p>
      <label>
        Description
        <textarea name="description" maxLength={2000} rows={5} />
      </label>
      <label>
        Access mode
        <select name="accessMode" defaultValue="GUEST_ALLOWED">
          <option value="GUEST_ALLOWED">Guests allowed</option>
          <option value="AUTH_REQUIRED">Account required</option>
        </select>
      </label>
      <label>
        Source type
        <select name="sourceType" defaultValue="UPLOAD">
          <option value="UPLOAD">HTML5 ZIP upload</option>
          <option value="CODE">Code</option>
          <option value="STORY">Story</option>
          <option value="PLATFORMER">Platformer</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
