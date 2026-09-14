import { afterEach, expect, test, vi } from "vitest";
import { api } from "../lib/api-client";

afterEach(() => vi.unstubAllGlobals());

test.each(["get", "post", "put", "patch"] as const)(
  "%s includes cookie credentials and returns the JSON body",
  async (method) => {
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

test("putBytes includes cookies on the platform upload slot", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await api.putBytes("http://localhost:3001/uploads/token", new ArrayBuffer(8));
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:3001/uploads/token",
    expect.objectContaining({
      method: "PUT",
      credentials: "include",
    }),
  );
});

test("putBytes omits cookies on a presigned object URL", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await api.putBytes(
    "https://r2.example/quarantine/a.zip?X-Amz-Signature=1",
    new ArrayBuffer(8),
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://r2.example/quarantine/a.zip?X-Amz-Signature=1",
    expect.objectContaining({
      method: "PUT",
      credentials: "omit",
    }),
  );
});

test("preserves status for non-JSON failures and accepts an empty success", async () => {
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
