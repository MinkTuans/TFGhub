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
