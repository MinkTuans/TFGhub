import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("uses the internal API URL during server rendering", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:3001/");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api");
  vi.stubGlobal("window", undefined);
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../lib/api-client");

  await api.get("/health");

  expect(fetch).toHaveBeenCalledWith(
    "http://api:3001/health",
    expect.objectContaining({ method: "GET" }),
  );
});

test("uses the public API prefix in a browser", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:3001");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/");
  vi.stubGlobal("window", {});
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../lib/api-client");

  await api.get("/health");

  expect(fetch).toHaveBeenCalledWith(
    "/api/health",
    expect.objectContaining({ method: "GET" }),
  );
});

test("uses the public API prefix for server-rendered browser URLs", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://api:3001");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/");
  vi.stubGlobal("window", undefined);
  const { resolvePublicApiBaseUrl } = await import("../lib/api-client");

  expect(resolvePublicApiBaseUrl()).toBe("/api");
});

test.each(["get", "post", "put", "patch"] as const)(
  "%s includes cookie credentials and returns the JSON body",
  async (method) => {
    const { api } = await import("../lib/api-client");
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ title: "Tiny Quest" })));
    vi.stubGlobal("fetch", fetch);
    const result =
      method === "get"
        ? await api.get("/games/mine")
        : await api[method]("/games", { title: "Tiny Quest" });
    expect(result).toEqual({ title: "Tiny Quest" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/games"),
      expect.objectContaining({
        method: method.toUpperCase(),
        credentials: "include",
        cache: "no-store",
      }),
    );
    if (method !== "get")
      expect(fetch.mock.calls[0][1].body).toBe('{"title":"Tiny Quest"}');
  },
);

test("preserves a JSON HTTP failure instead of returning it as success", async () => {
  const { api } = await import("../lib/api-client");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Game slug already exists" }), {
          status: 409,
        }),
      ),
  );
  await expect(api.post("/games", {})).rejects.toMatchObject({
    status: 409,
    message: "Game slug already exists",
  });
});

test("preserves status for non-JSON failures and accepts an empty success", async () => {
  const { api } = await import("../lib/api-client");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response("upstream unavailable", { status: 502 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 })),
  );
  await expect(api.get("/discover")).rejects.toMatchObject({ status: 502 });
  await expect(api.post("/auth/logout", {})).resolves.toBeUndefined();
});

test("sends form data unchanged so fetch supplies the multipart boundary", async () => {
  const { api } = await import("../lib/api-client");
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ artifactVersion: 1 })));
  vi.stubGlobal("fetch", fetch);
  const form = new FormData();
  form.set("game", new Blob(["zip bytes"]), "game.zip");

  await api.post("/games/game-1/upload", form);

  const request = fetch.mock.calls[0][1] as RequestInit;
  expect(request.body).toBe(form);
  expect(new Headers(request.headers).get("Content-Type")).toBeNull();
});
