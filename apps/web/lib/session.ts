import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api-client";

export type SessionUser = {
  id: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
};

export async function optionalSession(): Promise<SessionUser | null> {
  try {
    return await api.get<SessionUser>("/auth/me", {
      headers: { Cookie: (await cookies()).toString() },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function privateGet<T>(path: string): Promise<T> {
  try {
    return await api.get<T>(path, {
      headers: { Cookie: (await cookies()).toString() },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}
