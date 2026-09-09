"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateEngineGameResponse } from "@indieforge/contracts";
import { api, ApiError } from "../lib/api-client";
import { apiErrorMessage } from "../lib/api-error-message";

export function CreateEngineGame() {
  const router = useRouter();
  const creating = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (creating.current) return;
    creating.current = true;
    setPending(true);
    setError("");
    try {
      const { game } = await api.post<CreateEngineGameResponse>(
        "/games/engine-projects",
        {},
      );
      router.replace("/studio/games/" + game.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        apiErrorMessage(error, "Không thể tạo bản nháp. Vui lòng thử lại."),
      );
      creating.current = false;
      setPending(false);
    }
  }

  return (
    <div className="form-stack panel">
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={create} disabled={pending}>
        {pending ? "Đang tạo…" : "Tạo bản nháp"}
      </button>
    </div>
  );
}
