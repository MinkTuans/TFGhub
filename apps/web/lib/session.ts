import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api-client";

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
