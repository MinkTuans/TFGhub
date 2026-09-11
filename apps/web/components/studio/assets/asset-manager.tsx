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
  applyProjectMutations,
  GameAssetSummary,
  ListGameAssetsResponse,
  type GameAssetSummary as GameAsset,
} from "@indieforge/contracts";
import { ApiError, resolveApiBaseUrl } from "../../../lib/api-client";
import { useStudio } from "../studio-provider";
import { prepareStudioCommit } from "../studio-history";
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
type ReferenceEntry =
  | { status: "RESOLVED"; asset: GameAsset }
  | { status: "ERROR"; message: string };
type ReferenceTask = {
  key: string;
  projectKey: string;
  gameId: string;
  assetId: string;
};
const REFERENCE_READ_CONCURRENCY = 4;
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
  get(
    gameId: string,
    assetId: string,
    signal?: AbortSignal,
  ): Promise<GameAsset>;
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
  signal?: AbortSignal,
): Promise<GameAsset> {
  const response = await fetch(endpoint(path), {
    method,
    credentials: "include",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
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
    get: (gameId, assetId, signal) =>
      jsonRequest(
        "GET",
        `/games/${encodeURIComponent(gameId)}/assets/${encodeURIComponent(assetId)}`,
        undefined,
        signal,
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
  onPlaceAsset,
}: {
  client?: AssetClient;
  onAssetsChange?: (assets: GameAsset[]) => void;
  onPlaceAsset?: (payload: string) => void;
}) {
  const { state, dispatch } = useStudio();
  const [client] = useState(() => suppliedClient ?? createAssetClient());
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<GameAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const request = useRef(0);
  const referenceCache = useRef(new Map<string, ReferenceEntry>());
  const referenceQueue = useRef<ReferenceTask[]>([]);
  const referenceQueued = useRef(new Set<string>());
  const referenceInflight = useRef(new Map<string, AbortController>());
  const referenceActive = useRef(0);
  const [referenceVersion, setReferenceVersion] = useState(0);
  const projectKey = `${state.identity.gameId}/${state.identity.projectId}`;
  const declaredKey = state.document.assetIds.join(",");
  const visibleKey = assets.map((asset) => asset.id).join(",");
  const referenceContext = useRef({
    projectKey,
    declared: new Set(state.document.assetIds),
  });
  referenceContext.current = {
    projectKey,
    declared: new Set(state.document.assetIds),
  };
  const deletion = useRef<{
    asset: GameAsset;
    resolve: () => void;
    reject: (error: Error) => void;
    started: boolean;
  } | null>(null);

  const load = useCallback(
    async () => {
      const sequence = ++request.current;
      setLoading(true);
      setError("");
      try {
        const items: GameAsset[] = [];
        let authoritativeTotal = 0;
        for (let page = 0; page < pageCount; page += 1) {
          const result = await client.list(state.identity.gameId, {
            search,
            state: "READY",
            offset: page * 30,
            limit: 30,
            ...(category ? { category } : {}),
            ...(kind ? { kind } : {}),
          });
          if (sequence !== request.current) return;
          items.push(...result.items);
          authoritativeTotal = result.total;
          if (items.length >= result.total || result.items.length < 30) break;
        }
        setAssets(items);
        setTotal(authoritativeTotal);
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
    [category, client, kind, pageCount, search, state.identity.gameId],
  );

  useEffect(() => {
    // Invalidate an older request before the search debounce elapses so its
    // response cannot flash results from a previous filter.
    request.current += 1;
    const timer = setTimeout(() => void load(), search ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const rebuild = useCallback(async () => {
    request.current += 1;
    await load();
  }, [load]);

  function referenceKey(assetId: string) {
    return `${projectKey}/${assetId}`;
  }

  function referenceMessage(error: unknown) {
    if (error instanceof ApiError && error.status === 404)
      return "Không tìm thấy asset được tham chiếu";
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    )
      return "Không có quyền đọc asset được tham chiếu";
    return error instanceof Error
      ? error.message
      : "Không thể tải asset được tham chiếu";
  }

  function pumpReferenceQueue() {
    while (
      referenceActive.current < REFERENCE_READ_CONCURRENCY &&
      referenceQueue.current.length
    ) {
      const task = referenceQueue.current.shift()!;
      referenceQueued.current.delete(task.key);
      const current = referenceContext.current;
      if (
        current.projectKey !== task.projectKey ||
        !current.declared.has(task.assetId) ||
        referenceCache.current.has(task.key) ||
        referenceInflight.current.has(task.key)
      )
        continue;
      const controller = new AbortController();
      referenceInflight.current.set(task.key, controller);
      referenceActive.current += 1;
      void client
        .get(task.gameId, task.assetId, controller.signal)
        .then((asset) => {
          const latest = referenceContext.current;
          if (
            latest.projectKey === task.projectKey &&
            latest.declared.has(task.assetId)
          ) {
            referenceCache.current.set(task.key, {
              status: "RESOLVED",
              asset,
            });
            setReferenceVersion((version) => version + 1);
          }
        })
        .catch((error) => {
          const latest = referenceContext.current;
          if (
            !controller.signal.aborted &&
            latest.projectKey === task.projectKey &&
            latest.declared.has(task.assetId)
          ) {
            referenceCache.current.set(task.key, {
              status: "ERROR",
              message: referenceMessage(error),
            });
            setReferenceVersion((version) => version + 1);
          }
        })
        .finally(() => {
          referenceInflight.current.delete(task.key);
          referenceActive.current -= 1;
          pumpReferenceQueue();
        });
    }
  }

  function queueReference(assetId: string) {
    const key = referenceKey(assetId);
    if (
      referenceCache.current.has(key) ||
      referenceInflight.current.has(key) ||
      referenceQueued.current.has(key)
    )
      return;
    referenceQueued.current.add(key);
    referenceQueue.current.push({
      key,
      projectKey,
      gameId: state.identity.gameId,
      assetId,
    });
    pumpReferenceQueue();
  }

  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    const declared = new Set(declaredKey ? declaredKey.split(",") : []);
    for (const [key, controller] of referenceInflight.current) {
      const assetId = key.slice(key.lastIndexOf("/") + 1);
      if (!declared.has(assetId) || visible.has(assetId)) controller.abort();
    }
    referenceQueue.current = referenceQueue.current.filter((task) => {
      const keep =
        task.projectKey === projectKey &&
        declared.has(task.assetId) &&
        !visible.has(task.assetId);
      if (!keep) referenceQueued.current.delete(task.key);
      return keep;
    });
    for (const id of declared)
      if (!visible.has(id)) queueReference(id);
    // Keys are stable content strings; unrelated immutable document copies do
    // not restart reference reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, declaredKey, projectKey, visibleKey]);

  useEffect(
    () => () => {
      for (const controller of referenceInflight.current.values())
        controller.abort();
      referenceQueue.current = [];
      referenceQueued.current.clear();
    },
    [],
  );

  const resolved = useMemo(
    () =>
      state.document.assetIds.flatMap((assetId) => {
        const entry = referenceCache.current.get(referenceKey(assetId));
        return entry?.status === "RESOLVED" ? [entry.asset] : [];
      }),
    // referenceVersion is the explicit transient-cache change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [declaredKey, projectKey, referenceVersion],
  );
  const available = useMemo(() => {
    const byId = new Map<string, GameAsset>();
    for (const asset of [...resolved, ...assets]) byId.set(asset.id, asset);
    return [...byId.values()];
  }, [assets, resolved]);
  const unavailable = resolved.filter((asset) => asset.state !== "READY");
  const unresolved = state.document.assetIds.flatMap((assetId) => {
    if (assets.some((asset) => asset.id === assetId)) return [];
    const entry = referenceCache.current.get(referenceKey(assetId));
    if (entry?.status === "RESOLVED") return [];
    return [
      {
        assetId,
        status: entry?.status ?? ("LOADING" as const),
        message: entry?.status === "ERROR" ? entry.message : null,
      },
    ];
  });
  const referencedAssetIds = useMemo(() => {
    const referenced = new Set<string>();
    for (const assetId of state.document.assetIds) {
      try {
        applyProjectMutations(state.document, [
          { type: "asset.forget", assetId },
        ]);
      } catch {
        referenced.add(assetId);
      }
    }
    return referenced;
  }, [state.document]);
  useLayoutEffect(
    () => onAssetsChange?.(available),
    [available, onAssetsChange],
  );

  function changed(asset: GameAsset | null, removedId?: string) {
    if (removedId) {
      setAssets((current) => current.filter((item) => item.id !== removedId));
      const key = referenceKey(removedId);
      referenceInflight.current.get(key)?.abort();
      referenceCache.current.delete(key);
      setReferenceVersion((version) => version + 1);
    } else if (asset) {
      const replace = (items: GameAsset[]) =>
        items.map((item) => (item.id === asset.id ? asset : item));
      setAssets(replace);
      const key = referenceKey(asset.id);
      if (referenceCache.current.has(key)) {
        referenceCache.current.set(key, { status: "RESOLVED", asset });
        setReferenceVersion((version) => version + 1);
      }
    }
  }

  function retryReference(assetId: string) {
    const key = referenceKey(assetId);
    referenceInflight.current.get(key)?.abort();
    referenceCache.current.delete(key);
    setReferenceVersion((version) => version + 1);
    queueReference(assetId);
  }

  function matchesCurrentQuery(asset: GameAsset) {
    return (
      asset.state === "READY" &&
      (!category || asset.metadata.category === category) &&
      (!kind || asset.kind === kind) &&
      (!search ||
        asset.displayName.toLowerCase().includes(search.toLowerCase()))
    );
  }

  async function rename(asset: GameAsset, displayName: string) {
    const updated = await client.update(state.identity.gameId, asset.id, {
      displayName,
    });
    request.current += 1;
    if (matchesCurrentQuery(updated)) changed(updated);
    else changed(null, updated.id);
    await load();
  }

  function tombstone(asset: GameAsset) {
    const declared = state.document.assetIds.includes(asset.id);
    const acknowledged = state.acknowledged.document.assetIds.includes(
      asset.id,
    );
    if (referencedAssetIds.has(asset.id))
      return Promise.reject(new Error("Asset vẫn còn phụ thuộc trong dự án."));
    if (!declared && acknowledged)
      return Promise.reject(
        new Error("Khai báo asset chưa được lưu; hãy thử lưu lại trước."),
      );
    if (!declared)
      return client.tombstone(state.identity.gameId, asset.id).then(async () => {
        request.current += 1;
        changed(null, asset.id);
        await load();
      });
    if (deletion.current)
      return Promise.reject(new Error("Một asset khác đang được xử lý."));
    const mutations = [
      { type: "asset.forget" as const, assetId: asset.id },
    ];
    try {
      prepareStudioCommit(state, mutations);
    } catch {
      return Promise.reject(new Error("Không thể gỡ khai báo asset."));
    }
    return new Promise<void>((resolve, reject) => {
      deletion.current = { asset, resolve, reject, started: false };
      dispatch({ type: "commit", mutations });
    });
  }

  useEffect(() => {
    const operation = deletion.current;
    if (!operation) return;
    if (
      state.status === "UNSYNCED" ||
      state.status === "CONFLICT" ||
      state.recoveryError ||
      state.batchError
    ) {
      operation.reject(new Error("Không thể lưu việc gỡ khai báo asset."));
      deletion.current = null;
      return;
    }
    if (
      operation.started ||
      state.status !== "SAVED" ||
      state.document.assetIds.includes(operation.asset.id) ||
      state.acknowledged.document.assetIds.includes(operation.asset.id)
    )
      return;
    operation.started = true;
    void client
      .tombstone(state.identity.gameId, operation.asset.id)
      .then(async () => {
        request.current += 1;
        setAssets((current) =>
          current.filter((item) => item.id !== operation.asset.id),
        );
        const key = `${projectKey}/${operation.asset.id}`;
        referenceInflight.current.get(key)?.abort();
        referenceCache.current.delete(key);
        setReferenceVersion((version) => version + 1);
        await load();
        operation.resolve();
      })
      .catch((error) =>
        operation.reject(
          error instanceof Error ? error : new Error("Không thể xóa asset"),
        ),
      )
      .finally(() => {
        if (deletion.current === operation) deletion.current = null;
      });
  }, [
    client,
    load,
    projectKey,
    state.acknowledged.document.assetIds,
    state.batchError,
    state.document.assetIds,
    state.identity.gameId,
    state.recoveryError,
    state.status,
  ]);

  return (
    <section className="studio-asset-manager" aria-label="Tài nguyên">
      <div className="studio-asset-heading">
        <h2>Tài nguyên</h2>
        <AssetUploader
          gameId={state.identity.gameId}
          category={category || "USER"}
          client={client}
          onUploaded={() => void rebuild()}
        />
      </div>
      <div className="studio-asset-groups" aria-label="Nhóm tài nguyên">
        {categories.map(([label, value]) => (
          <button
            type="button"
            key={value || "ALL"}
            aria-pressed={category === value}
            onClick={() => {
              setPageCount(1);
              setCategory(value);
            }}
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
            onChange={(event) => {
              setPageCount(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Loại file</span>
          <select
            aria-label="Loại file"
            value={kind}
            onChange={(event) => {
              setPageCount(1);
              setKind(event.target.value);
            }}
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
            onClick={() => void rebuild()}
          >
            Thử lại
          </button>
        </p>
      )}
      {loading && !assets.length ? (
        <p role="status">Đang tải tài nguyên…</p>
      ) : (
        <AssetGrid
          assets={assets}
          declaredAssetIds={state.document.assetIds}
          referencedAssetIds={referencedAssetIds}
          onRename={rename}
          onTombstone={tombstone}
          onPlaceAsset={onPlaceAsset}
        />
      )}
      {(unresolved.length > 0 || unavailable.length > 0) && (
        <section aria-label="Tài nguyên tham chiếu không khả dụng">
          <h3>Tham chiếu không khả dụng</h3>
          {unresolved.length > 0 && (
            <div className="studio-asset-grid">
              {unresolved.map((entry) => (
                <article
                  className="studio-asset-card"
                  role="group"
                  aria-label={`Asset reference ${entry.assetId}`}
                  draggable={false}
                  key={entry.assetId}
                >
                  <strong>{entry.assetId}</strong>
                  {entry.status === "LOADING" ? (
                    <span role="status">Đang tải tham chiếu…</span>
                  ) : (
                    <>
                      <span role="status" aria-live="assertive">
                        {entry.message}
                      </span>
                      <button
                        type="button"
                        aria-label={`Thử lại asset ${entry.assetId}`}
                        onClick={() => retryReference(entry.assetId)}
                      >
                        Thử lại
                      </button>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
          {unavailable.length > 0 && (
            <AssetGrid
              assets={unavailable}
              declaredAssetIds={state.document.assetIds}
              referencedAssetIds={referencedAssetIds}
              onRename={rename}
              onTombstone={tombstone}
            />
          )}
        </section>
      )}
      {assets.length < total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => setPageCount((count) => count + 1)}
        >
          Tải thêm
        </button>
      )}
    </section>
  );
}
