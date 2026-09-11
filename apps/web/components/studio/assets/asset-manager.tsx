"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GameAssetSummary,
  ListGameAssetsResponse,
  type GameAssetSummary as GameAsset,
} from "@indieforge/contracts";
import { ApiError, resolveApiBaseUrl } from "../../../lib/api-client";
import { useStudio } from "../studio-provider";
import { AssetGrid } from "./asset-grid";
import { AssetUploader } from "./asset-uploader";

type AssetQuery = {
  search: string;
  state: string;
  offset: number;
  limit: number;
  category?: string;
  kind?: string;
};
type UploadInput = {
  uploadId: string;
  file: File;
  category: string;
  displayName?: string;
};
export type AssetClient = {
  list(
    gameId: string,
    query: AssetQuery,
  ): Promise<{
    items: GameAsset[];
    total: number;
    offset: number;
    limit: number;
  }>;
  get(gameId: string, assetId: string): Promise<GameAsset>;
  upload(
    gameId: string,
    input: UploadInput,
    onProgress: (percentage: number) => void,
  ): Promise<GameAsset>;
  update(
    gameId: string,
    assetId: string,
    changes: { displayName?: string; category?: string },
  ): Promise<GameAsset>;
  tombstone(gameId: string, assetId: string): Promise<GameAsset>;
};

const categories = [
  ["All", ""],
  ["Map-Tileset", "MAP_TILESET"],
  ["Character", "CHARACTER"],
  ["NPC", "NPC"],
  ["Item", "ITEM"],
  ["UI", "UI"],
  ["Audio", "AUDIO"],
  ["Effect", "EFFECT"],
  ["Image", "IMAGE"],
  ["User", "USER"],
] as const;

const endpoint = (path: string) =>
  `${resolveApiBaseUrl().replace(/\/$/, "")}${path}`;
async function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<GameAsset> {
  const response = await fetch(endpoint(path), {
    method,
    credentials: "include",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return GameAssetSummary.parse(await response.json());
}

export function createAssetClient(): AssetClient {
  return {
    async list(gameId, query) {
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined && value !== "")
          parameters.set(key, String(value));
      const response = await fetch(
        endpoint(`/games/${encodeURIComponent(gameId)}/assets?${parameters}`),
        { method: "GET", credentials: "include", cache: "no-store" },
      );
      if (!response.ok)
        throw new ApiError(
          response.status,
          `Request failed (${response.status})`,
        );
      return ListGameAssetsResponse.parse(await response.json());
    },
    get: (gameId, assetId) =>
      jsonRequest(
        "GET",
        `/games/${encodeURIComponent(gameId)}/assets/${encodeURIComponent(assetId)}`,
      ),
    upload(gameId, input, onProgress) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(
          "POST",
          endpoint(`/games/${encodeURIComponent(gameId)}/assets`),
        );
        request.withCredentials = true;
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable)
            onProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener("load", () => {
          let payload: unknown = null;
          try {
            payload = JSON.parse(request.responseText);
          } catch {
            /* Preserve the HTTP result when an upstream body is not JSON. */
          }
          if (request.status >= 200 && request.status < 300) {
            const parsed = GameAssetSummary.safeParse(payload);
            if (parsed.success) resolve(parsed.data);
            else reject(new Error("Phản hồi upload không hợp lệ"));
          } else {
            const message =
              payload && typeof payload === "object" && "message" in payload
                ? String(payload.message)
                : `Request failed (${request.status})`;
            reject(new ApiError(request.status, message));
          }
        });
        request.addEventListener("error", () =>
          reject(new Error("Mất kết nối khi tải lên")),
        );
        request.addEventListener("abort", () =>
          reject(new Error("Upload đã bị hủy")),
        );
        const form = new FormData();
        form.set("uploadId", input.uploadId);
        form.set("category", input.category);
        if (input.displayName) form.set("displayName", input.displayName);
        form.set("file", input.file, input.file.name);
        request.send(form);
      });
    },
    update: (gameId, assetId, changes) =>
      jsonRequest(
        "PATCH",
        `/games/${encodeURIComponent(gameId)}/assets/${encodeURIComponent(assetId)}`,
        changes,
      ),
    tombstone: (gameId, assetId) =>
      jsonRequest(
        "DELETE",
        `/games/${encodeURIComponent(gameId)}/assets/${encodeURIComponent(assetId)}`,
      ),
  };
}

export function AssetManager({
  client: suppliedClient,
  onAssetsChange,
}: {
  client?: AssetClient;
  onAssetsChange?: (assets: GameAsset[]) => void;
}) {
  const { state } = useStudio();
  const [client] = useState(() => suppliedClient ?? createAssetClient());
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<GameAsset[]>([]);
  const [resolved, setResolved] = useState<GameAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);

  const load = useCallback(
    async (offset = 0) => {
      const sequence = ++request.current;
      setLoading(true);
      setError("");
      try {
        const result = await client.list(state.identity.gameId, {
          search,
          state: "READY",
          offset,
          limit: 30,
          ...(category ? { category } : {}),
          ...(kind ? { kind } : {}),
        });
        if (sequence !== request.current) return;
        setAssets((current) =>
          offset ? [...current, ...result.items] : result.items,
        );
        setTotal(result.total);
      } catch (failure) {
        if (sequence === request.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Không thể tải thư viện tài nguyên",
          );
      } finally {
        if (sequence === request.current) setLoading(false);
      }
    },
    [category, client, kind, search, state.identity.gameId],
  );

  useEffect(() => {
    // Invalidate an older request before the search debounce elapses so its
    // response cannot flash results from a previous filter.
    request.current += 1;
    const timer = setTimeout(() => void load(0), search ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, refresh, search]);

  useEffect(() => {
    let active = true;
    const visible = new Set(assets.map((asset) => asset.id));
    const missing = state.document.assetIds.filter((id) => !visible.has(id));
    void Promise.all(
      missing.map((id) =>
        client.get(state.identity.gameId, id).catch(() => null),
      ),
    ).then((items) => {
      if (active)
        setResolved(items.filter((item): item is GameAsset => !!item));
    });
    return () => {
      active = false;
    };
  }, [assets, client, state.document.assetIds, state.identity.gameId]);

  const available = useMemo(() => {
    const byId = new Map<string, GameAsset>();
    for (const asset of [...assets, ...resolved]) byId.set(asset.id, asset);
    return [...byId.values()];
  }, [assets, resolved]);
  const unavailable = resolved.filter((asset) => asset.state !== "READY");
  useLayoutEffect(
    () => onAssetsChange?.(available),
    [available, onAssetsChange],
  );

  function changed(asset: GameAsset | null, removedId?: string) {
    if (removedId) {
      setAssets((current) => current.filter((item) => item.id !== removedId));
      setResolved((current) => current.filter((item) => item.id !== removedId));
    } else if (asset) {
      const replace = (items: GameAsset[]) =>
        items.map((item) => (item.id === asset.id ? asset : item));
      setAssets(replace);
      setResolved(replace);
    }
  }

  return (
    <section className="studio-asset-manager" aria-label="Tài nguyên">
      <div className="studio-asset-heading">
        <h2>Tài nguyên</h2>
        <AssetUploader
          gameId={state.identity.gameId}
          category={category || "USER"}
          client={client}
          onUploaded={() => setRefresh((value) => value + 1)}
        />
      </div>
      <div className="studio-asset-groups" aria-label="Nhóm tài nguyên">
        {categories.map(([label, value]) => (
          <button
            type="button"
            key={value || "ALL"}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="studio-asset-filters">
        <label>
          <span>Tìm asset</span>
          <input
            type="search"
            aria-label="Tìm asset"
            value={search}
            maxLength={160}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Loại file</span>
          <select
            aria-label="Loại file"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="IMAGE">Hình ảnh</option>
            <option value="AUDIO">Âm thanh</option>
            <option value="FONT">Font</option>
            <option value="OTHER">Khác</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="status" aria-label="Lỗi tải tài nguyên">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Thử lại
          </button>
        </p>
      )}
      {loading && !assets.length ? (
        <p role="status">Đang tải tài nguyên…</p>
      ) : (
        <AssetGrid
          gameId={state.identity.gameId}
          assets={assets}
          declaredAssetIds={state.document.assetIds}
          client={client}
          onChanged={changed}
        />
      )}
      {unavailable.length > 0 && (
        <section aria-label="Tài nguyên tham chiếu không khả dụng">
          <h3>Tham chiếu không khả dụng</h3>
          <AssetGrid
            gameId={state.identity.gameId}
            assets={unavailable}
            declaredAssetIds={state.document.assetIds}
            client={client}
            onChanged={changed}
          />
        </section>
      )}
      {assets.length < total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(assets.length)}
        >
          Tải thêm
        </button>
      )}
    </section>
  );
}
