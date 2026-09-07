export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = { headers?: HeadersInit };

export function resolveApiBaseUrl(): string {
  const configured =
    typeof window === "undefined"
      ? process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
      : process.env.NEXT_PUBLIC_API_URL;
  return (configured ?? "http://localhost:3001").replace(/\/$/, "");
}

export function resolvePublicApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: Options = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData)
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error: unknown = await response.json();
      if (typeof error === "object" && error !== null && "message" in error) {
        if (typeof error.message === "string") message = error.message;
        else if (
          Array.isArray(error.message) &&
          error.message.every((item) => typeof item === "string")
        )
          message = error.message.join(", ");
      }
    } catch {
      /* Preserve HTTP status when an upstream response is not JSON. */
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: Options) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body: unknown, options?: Options) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body: unknown, options?: Options) =>
    request<T>("PUT", path, body, options),
  patch: <T>(path: string, body: unknown, options?: Options) =>
    request<T>("PATCH", path, body, options),
};
