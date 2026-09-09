import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplyMutationBatchInput } from "@indieforge/contracts";
import type { StudioState } from "../components/studio/studio-state";
import type {
  RecoveryEnvelope,
  RecoveryStorage,
} from "../components/studio/studio-recovery";
import type { StudioProviderProps } from "../components/studio/studio-provider";

const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const identity = { userId: "owner", gameId: "game", projectId: id(1) };
const rename = (name: string) => ({
  type: "scene.rename" as const,
  sceneId: id(2),
  name,
});
function project(name = "Opening") {
  return {
    schemaVersion: 2 as const,
    projectId: id(1),
    engineFamily: "TFG_ENGINE" as const,
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [],
    scenes: [
      {
        id: id(2),
        name,
        key: "opening",
        order: 0,
        type: "MIXED" as const,
        width: 640,
        height: 480,
        background: { color: "#102030", assetId: null },
        settings: {
          gravityX: 0,
          gravityY: 0,
          grid: { enabled: false, size: 32, snap: false },
        },
        layers: [
          {
            id: id(3),
            name: "World",
            order: 0,
            type: "WORLD" as const,
            visible: true,
            locked: false,
          },
        ],
        objects: [],
      },
    ],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  };
}

// Before implementation each case fails this assertion, rather than a module-resolution error.
async function modules() {
  const files = import.meta.glob("../components/studio/*.{ts,tsx}");
  for (const file of [
    "studio-state.ts",
    "studio-reducer.ts",
    "studio-provider.tsx",
    "studio-recovery.ts",
  ])
    expect(files, `Missing Studio implementation: ${file}`).toHaveProperty([
      `../components/studio/${file}`,
    ]);
  return {
    state: (await files[
      "../components/studio/studio-state.ts"
    ]()) as typeof import("../components/studio/studio-state"),
    reducer: (await files[
      "../components/studio/studio-reducer.ts"
    ]()) as typeof import("../components/studio/studio-reducer"),
    provider: (await files[
      "../components/studio/studio-provider.tsx"
    ]()) as typeof import("../components/studio/studio-provider"),
    recovery: (await files[
      "../components/studio/studio-recovery.ts"
    ]()) as typeof import("../components/studio/studio-recovery"),
  };
}

function memoryStorage() {
  const records = new Map<string, unknown>();
  const key = (value: typeof identity) =>
    JSON.stringify([value.userId, value.projectId]);
  const storage: RecoveryStorage = {
    async read(scope) {
      return structuredClone(records.get(key(scope)) ?? null);
    },
    async write(envelope) {
      records.set(key(envelope), structuredClone(envelope));
    },
  };
  return { storage, records, key };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async (ms = 0) => {
  // Let asynchronous storage finish and React install its debounce before
  // moving the clock; advancing time inside the same act batches that render.
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

async function harness(overrides: Partial<StudioProviderProps> = {}) {
  const loaded = await modules();
  const memory = memoryStorage();
  let sequence = 0;
  const requests: ApplyMutationBatchInput[] = [];
  const responses: ReturnType<
    typeof deferred<{ revision: number; document: ReturnType<typeof project> }>
  >[] = [];
  const props: StudioProviderProps = {
    identity,
    initial: { revision: 0, document: project() },
    storage: memory.storage,
    clock: {
      now: () => Date.now(),
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (timer) => clearTimeout(timer),
    },
    newMutationId: () => `mutation-${++sequence}`,
    debounceMs: 100,
    historyLimit: 2,
    transport: async (_gameId, batch) => {
      requests.push(structuredClone(batch));
      const response = deferred<{
        revision: number;
        document: ReturnType<typeof project>;
      }>();
      responses.push(response);
      return response.promise;
    },
    ...overrides,
  };
  const hook = renderHook(() => loaded.provider.useStudio(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <loaded.provider.StudioProvider {...props}>
          {children}
        </loaded.provider.StudioProvider>
      </StrictMode>
    ),
  });
  await tick();
  return { ...hook, ...memory, props, requests, responses, loaded };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface StudioBrowserWindow extends Window {
  studio: ReturnType<
    typeof import("../components/studio/studio-provider").useStudio
  >;
  mountStudio(props?: Partial<StudioProviderProps>): void;
  unmountStudio(): void;
  nativeStorage: typeof import("../components/studio/studio-recovery").browserRecoveryStorage;
  handoff: {
    releaseFirst(): void;
    releaseLast(): void;
    firstPersisted: boolean;
    lastStarted: boolean;
  };
}

async function studioBrowser() {
  const { createViteServer } = await import("vitest/node");
  const { chromium } = await import("@playwright/test");
  const { existsSync } = await import("node:fs");
  const entry = "\0virtual:studio-browser";
  const server = await createViteServer({
    configFile: false,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    define: {
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify("http://192.0.2.50"),
    },
    plugins: [
      {
        name: "studio-browser-test-fixture",
        resolveId: (value) => (value === entry ? entry : undefined),
        load: (value) =>
          value === entry
            ? `
        import "/@vite/env";
        import { createElement, StrictMode, useEffect } from "react";
        import { createRoot } from "react-dom/client";
        import { StudioProvider, useStudio } from "/components/studio/studio-provider.tsx";
        import { browserRecoveryStorage } from "/components/studio/studio-recovery.ts";
        function Observe() {
          const studio = useStudio();
          useEffect(() => { window.studio = studio; }, [studio]);
          return null;
        }
        window.nativeStorage = browserRecoveryStorage;
        window.mountStudio = (props = {}) => {
          const root = createRoot(document.getElementById("root"));
          window.unmountStudio = () => root.unmount();
          root.render(createElement(StrictMode, null,
            createElement(StudioProvider, { identity: ${JSON.stringify(identity)},
              initial: ${JSON.stringify({ revision: 0, document: project() })}, ...props },
              createElement(Observe))));
        };
      `
            : undefined,
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url !== "/") {
              next();
              return;
            }
            response.setHeader("Content-Type", "text/html");
            response.end(
              '<div id="root"></div><script type="module" src="/@id/__x00__virtual:studio-browser"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync("/usr/bin/google-chrome")
          ? "/usr/bin/google-chrome"
          : undefined),
    });
    const page = await browser.newPage();
    await page.route("http://192.0.2.50/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        response: await route.fetch({
          url: `http://127.0.0.1:${address.port}${url.pathname}${url.search}`,
        }),
      });
    });
    await page.goto("http://192.0.2.50/");
    await page.waitForFunction(
      () =>
        typeof (window as unknown as StudioBrowserWindow).mountStudio ===
        "function",
    );
    return {
      page,
      close: async () => {
        await browser!.close();
        await server.close();
      },
    };
  } catch (error) {
    await browser?.close();
    await server.close();
    throw error;
  }
}

describe("Studio reducer and history", () => {
  it("optimistically applies validated stable-ID edits without mutating the acknowledged document", async () => {
    const { state, reducer } = await modules();
    const initial = state.createStudioState(
      identity,
      { revision: 7, document: project() },
      2,
    );
    const next = reducer.studioReducer(initial, {
      type: "commit",
      mutations: [rename("  New  ")],
      mutationId: "edit",
      timestamp: 10,
    });
    expect(next.document.scenes[0].name).toBe("New");
    expect(next.acknowledged).toEqual({ revision: 7, document: project() });
    expect(next.pending).toEqual({
      baseRevision: 7,
      mutationId: "edit",
      mutations: [rename("New")],
    });
    expect(next.status).toBe("DIRTY");
    expect(initial.document).toEqual(project());
    expect(() =>
      reducer.studioReducer(next, {
        type: "commit",
        mutations: [rename(" ")],
        mutationId: "invalid",
        timestamp: 11,
      }),
    ).toThrow();
    expect(next.document.scenes[0].name).toBe("New");
  });

  it("bounds undo/redo and invalidates the redo branch after a new edit", async () => {
    const { state, reducer } = await modules();
    let value = state.createStudioState(
      identity,
      { revision: 0, document: project() },
      2,
    );
    const reduce = (action: Parameters<typeof reducer.studioReducer>[1]) => {
      value = reducer.studioReducer(value, action);
    };
    for (const name of ["A", "B", "C"])
      reduce({
        type: "commit",
        mutations: [rename(name)],
        mutationId: name,
        timestamp: 1,
      });
    expect(value.history.past).toHaveLength(2);
    reduce({ type: "undo", mutationId: "undo1", timestamp: 2 });
    expect(value.document.scenes[0].name).toBe("B");
    reduce({ type: "undo", mutationId: "undo2", timestamp: 3 });
    reduce({ type: "undo", mutationId: "undo3", timestamp: 4 });
    expect(value.document.scenes[0].name).toBe("A");
    reduce({ type: "redo", mutationId: "redo", timestamp: 5 });
    expect(value.document.scenes[0].name).toBe("B");
    reduce({
      type: "commit",
      mutations: [rename("D")],
      mutationId: "D",
      timestamp: 6,
    });
    reduce({ type: "redo", mutationId: "stale-redo", timestamp: 7 });
    expect(value.document.scenes[0].name).toBe("D");
    expect(value.history.future).toHaveLength(0);
  });

  it("coalesces consecutive gesture commits into one deterministic undo entry", async () => {
    const { state, reducer } = await modules();
    let value = state.createStudioState(
      identity,
      { revision: 0, document: project() },
      2,
    );
    for (const name of ["A", "B", "C"])
      value = reducer.studioReducer(value, {
        type: "commit",
        mutations: [rename(name)],
        gestureId: "gesture",
        mutationId: name,
        timestamp: 1,
      });
    expect(value.history.past).toHaveLength(1);
    value = reducer.studioReducer(value, {
      type: "undo",
      mutationId: "undo",
      timestamp: 2,
    });
    expect(value.document.scenes[0].name).toBe("Opening");
    value = reducer.studioReducer(value, {
      type: "redo",
      mutationId: "redo",
      timestamp: 3,
    });
    expect(value.document.scenes[0].name).toBe("C");
  });
});

describe("Studio autosave and recovery", () => {
  it.each([false, true])(
    "drains outgoing queued writes before replacement hydration (earlier write rejected: %s)",
    async (rejectEarlier) => {
      vi.useFakeTimers();
      const memory = memoryStorage();
      const firstGate = deferred<void>();
      const lastGate = deferred<void>();
      const storage: RecoveryStorage = {
        read: memory.storage.read,
        async write(envelope) {
          const mutation = envelope.pending?.mutations.at(-1);
          const name =
            mutation?.type === "scene.rename" ? mutation.name : undefined;
          if (name === "First") {
            await firstGate.promise;
            if (rejectEarlier) throw new Error("first write failed");
          }
          if (name === "Latest") await lastGate.promise;
          await memory.storage.write(envelope);
        },
      };
      const outgoing = await harness({ storage });
      act(() =>
        outgoing.result.current.dispatch({
          type: "commit",
          mutations: [rename("First")],
        }),
      );
      await tick();
      act(() =>
        outgoing.result.current.dispatch({
          type: "commit",
          mutations: [rename("Latest")],
        }),
      );
      await tick();
      outgoing.unmount();
      const incoming = await harness({ storage });
      try {
        expect(incoming.result.current.state.ready).toBe(false);
        await act(async () => firstGate.resolve());
        await tick();
        expect(incoming.result.current.state.ready).toBe(false);
        const other = await harness({
          storage,
          identity: { ...identity, userId: "other" },
        });
        expect(other.result.current.state.ready).toBe(true);
        other.unmount();
        await act(async () => lastGate.resolve());
        await tick();
        expect(incoming.result.current.state.ready).toBe(true);
        expect(incoming.result.current.state.document).toEqual(
          project("Latest"),
        );
        expect(await memory.storage.read(identity)).toMatchObject({
          pending: { mutations: [rename("First"), rename("Latest")] },
        });
      } finally {
        incoming.unmount();
        await act(async () => {
          firstGate.resolve();
          lastGate.resolve();
        });
      }
    },
  );

  it("keeps pointer previews out of history, recovery, and autosave until commit", async () => {
    vi.useFakeTimers();
    const h = await harness();
    const before = h.result.current.state;
    act(() =>
      h.result.current.dispatch({
        type: "preview",
        mutations: [rename("Preview")],
        gestureId: "drag",
      }),
    );
    expect(h.result.current.state.preview?.document.scenes[0].name).toBe(
      "Preview",
    );
    expect(h.result.current.state.document.scenes[0].name).toBe("Opening");
    expect(h.result.current.state.history).toEqual(before.history);
    await tick(500);
    expect(h.requests).toHaveLength(0);
    expect(await h.storage.read(identity)).toMatchObject({
      pending: null,
      acknowledged: { document: project() },
    });
    act(() => h.result.current.dispatch({ type: "commit-preview" }));
    expect(h.result.current.state.history.past).toHaveLength(1);
    await tick(100);
    expect(h.requests).toEqual([
      {
        baseRevision: 0,
        mutationId: expect.any(String),
        mutations: [rename("Preview")],
      },
    ]);
  });

  it("debounces edits and persists the exact batch before transport; acknowledgement saves the server revision", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("First")],
      }),
    );
    await tick(60);
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Final")],
      }),
    );
    await tick(99);
    expect(h.requests).toHaveLength(0);
    await tick(1);
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.state.status).toBe("SAVING");
    expect(await h.storage.read(identity)).toMatchObject({
      pending: h.requests[0],
      acknowledged: { revision: 0 },
      queued: [],
    });
    await act(async () =>
      h.responses[0].resolve({ revision: 1, document: project("Final") }),
    );
    await tick();
    expect(h.result.current.state.status).toBe("SAVED");
    expect(h.result.current.state.acknowledged).toEqual({
      revision: 1,
      document: project("Final"),
    });
    expect(await h.storage.read(identity)).toMatchObject({
      pending: null,
      acknowledged: { revision: 1, document: project("Final") },
    });
  });

  it("preserves offline work and retries the same mutation ID and original batch after later edits", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("First")],
      }),
    );
    await tick(100);
    await act(async () => h.responses[0].reject(new TypeError("offline")));
    expect(h.result.current.state.status).toBe("UNSYNCED");
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Later")],
      }),
    );
    await tick(1000);
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.state.status).toBe("UNSYNCED");
    act(() => h.result.current.dispatch({ type: "retry" }));
    await tick(100);
    expect(h.requests[1]).toEqual(h.requests[0]);
    await act(async () =>
      h.responses[1].resolve({ revision: 1, document: project("First") }),
    );
    expect(h.result.current.state.document.scenes[0].name).toBe("Later");
    await tick(100);
    expect(h.requests[2]).toMatchObject({
      baseRevision: 1,
      mutations: [rename("Later")],
    });
    expect(h.requests[2].mutationId).not.toBe(h.requests[0].mutationId);
    await act(async () =>
      h.responses[2].resolve({ revision: 2, document: project("Later") }),
    );
    expect(h.result.current.state.status).toBe("SAVED");
  });

  it("queues an undo during a save and sends it against the acknowledged revision", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("First")],
      }),
    );
    await tick(100);
    act(() => h.result.current.dispatch({ type: "undo" }));
    expect(h.result.current.state.document.scenes[0].name).toBe("Opening");
    await act(async () =>
      h.responses[0].resolve({ revision: 1, document: project("First") }),
    );
    await tick(100);
    expect(h.requests[1]).toMatchObject({
      baseRevision: 1,
      mutations: [rename("Opening")],
    });
  });

  it("restores pending work before autosaving and replays a lost acknowledgement on reload", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Lost reply")],
      }),
    );
    await tick(100);
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Later")],
      }),
    );
    await tick();
    h.unmount();
    const reloaded = await harness({
      storage: h.storage,
      initial: { revision: 1, document: project("Lost reply") },
    });
    expect(reloaded.result.current.state.document.scenes[0].name).toBe("Later");
    expect(reloaded.result.current.state.acknowledged.revision).toBe(0);
    await tick(100);
    expect(reloaded.requests[0]).toEqual(h.requests[0]);
    await act(async () =>
      reloaded.responses[0].resolve({
        revision: 1,
        document: project("Lost reply"),
      }),
    );
    await tick(100);
    expect(reloaded.requests[1]).toMatchObject({
      baseRevision: 1,
      mutations: [rename("Later")],
    });
  });

  it("preserves both local and canonical base documents on 409, including after reload", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Local")],
      }),
    );
    await tick(100);
    await act(async () =>
      h.responses[0].reject(new h.loaded.state.StudioConflictError(4)),
    );
    await tick();
    const assertConflict = (value: StudioState) => {
      expect(value.status).toBe("CONFLICT");
      expect(value.conflictRevision).toBe(4);
      expect(value.document).toEqual(project("Local"));
      expect(value.acknowledged).toEqual({ revision: 0, document: project() });
    };
    assertConflict(h.result.current.state);
    act(() => h.result.current.dispatch({ type: "retry" }));
    await tick(1000);
    expect(h.requests).toHaveLength(1);
    h.unmount();
    const reloaded = await harness({
      storage: h.storage,
      initial: { revision: 4, document: project("Remote") },
    });
    assertConflict(reloaded.result.current.state);
    await tick(1000);
    expect(reloaded.requests).toHaveLength(0);
  });

  it("does not discard a newer acknowledged recovery snapshot when the initial read is stale", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Saved")],
      }),
    );
    await tick(100);
    await act(async () =>
      h.responses[0].resolve({ revision: 1, document: project("Saved") }),
    );
    await tick();
    h.unmount();
    const reloaded = await harness({ storage: h.storage });
    expect(reloaded.result.current.state.acknowledged).toEqual({
      revision: 1,
      document: project("Saved"),
    });
    expect(reloaded.result.current.state.status).toBe("SAVED");
  });

  it("keeps a 409 without a readable revision in conflict after recovery", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Local")],
      }),
    );
    await tick(100);
    await act(async () =>
      h.responses[0].reject(new h.loaded.state.StudioConflictError(null)),
    );
    await tick();
    expect(h.result.current.state.status).toBe("CONFLICT");
    h.unmount();
    const reloaded = await harness({ storage: h.storage });
    expect(reloaded.result.current.state.status).toBe("CONFLICT");
    expect(reloaded.result.current.state.document).toEqual(project("Local"));
    await tick(1000);
    expect(reloaded.requests).toHaveLength(0);
  });

  it("does not change a replay ID after storage recovers while the original save is still in flight", async () => {
    vi.useFakeTimers();
    const memory = memoryStorage();
    let fail = false;
    const h = await harness({
      storage: {
        read: memory.storage.read,
        write: async (envelope) => {
          if (fail) throw new Error("quota");
          await memory.storage.write(envelope);
        },
      },
    });
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("First")],
      }),
    );
    await tick(100);
    fail = true;
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Later")],
      }),
    );
    await tick();
    expect(h.result.current.state.status).toBe("UNSYNCED");
    fail = false;
    act(() => h.result.current.dispatch({ type: "retry" }));
    await tick(100);
    expect(h.requests).toHaveLength(1);
    await act(async () =>
      h.responses[0].resolve({ revision: 1, document: project("First") }),
    );
    await tick(100);
    expect(h.requests[1]).toMatchObject({
      baseRevision: 1,
      mutations: [rename("Later")],
    });
  });

  it("serializes slow recovery writes before sending and retains the latest committed timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const memory = memoryStorage();
    const gate = deferred<void>();
    let slow = false;
    const h = await harness({
      storage: {
        read: memory.storage.read,
        write: async (envelope) => {
          if (slow) await gate.promise;
          await memory.storage.write(envelope);
        },
      },
    });
    slow = true;
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("First")],
      }),
    );
    await tick(100);
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Latest")],
      }),
    );
    await tick(100);
    expect(h.requests).toHaveLength(0);
    await act(async () => gate.resolve());
    expect(await memory.storage.read(identity)).toMatchObject({
      timestamp: 1100,
      pending: { mutations: [rename("First"), rename("Latest")] },
    });
    await tick(100);
    expect(h.requests[0].mutations).toEqual([
      rename("First"),
      rename("Latest"),
    ]);
  });

  it.each([
    { label: "wrong revision", revision: 8, document: project("Wrong") },
    {
      label: "wrong project",
      revision: 1,
      document: { ...project("Wrong"), projectId: id(99) },
    },
  ])(
    "preserves pending work on a $label acknowledgement",
    async (acknowledgement) => {
      vi.useFakeTimers();
      const h = await harness();
      act(() =>
        h.result.current.dispatch({
          type: "commit",
          mutations: [rename("Local")],
        }),
      );
      await tick(100);
      await act(async () => h.responses[0].resolve(acknowledgement));
      expect(h.result.current.state.status).toBe("UNSYNCED");
      expect(h.result.current.state.acknowledged).toEqual({
        revision: 0,
        document: project(),
      });
      expect(h.result.current.state.document).toEqual(project("Local"));
      expect(h.result.current.state.pending).toEqual(h.requests[0]);
    },
  );

  it("isolates user/project recovery and refuses mismatched or malformed envelopes", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Private")],
      }),
    );
    await tick();
    h.unmount();
    const other = await harness({
      storage: h.storage,
      identity: { ...identity, userId: "other" },
    });
    expect(other.result.current.state.document).toEqual(project());
    other.unmount();
    const wrongScope = await harness({
      storage: {
        read: async () => h.storage.read(identity),
        write: async () => {},
      },
      identity: { ...identity, userId: "other" },
    });
    expect(wrongScope.result.current.state.ready).toBe(false);
    expect(wrongScope.result.current.state.status).toBe("UNSYNCED");
    expect(wrongScope.result.current.state.document).toEqual(project());
    wrongScope.unmount();
    const malformed = await harness({
      storage: {
        read: async () => ({ version: 1, pending: { mutations: [] } }),
        write: async () => {},
      },
    });
    expect(malformed.result.current.state.ready).toBe(false);
    expect(malformed.result.current.state.status).toBe("UNSYNCED");
    expect(malformed.requests).toHaveLength(0);
  });

  it("blocks editing until recovery is read and allows retry when storage becomes available", async () => {
    vi.useFakeTimers();
    let unavailable = true;
    const memory = memoryStorage();
    const h = await harness({
      storage: {
        read: async (scope) => {
          if (unavailable) throw new Error("blocked");
          return memory.storage.read(scope);
        },
        write: memory.storage.write,
      },
    });
    expect(h.result.current.state.ready).toBe(false);
    expect(h.result.current.state.status).toBe("UNSYNCED");
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Blocked")],
      }),
    );
    expect(h.result.current.state.document).toEqual(project());
    unavailable = false;
    act(() => h.result.current.dispatch({ type: "retry" }));
    await tick();
    expect(h.result.current.state.ready).toBe(true);
    expect(h.result.current.state.status).toBe("SAVED");
  });

  it("keeps work visibly unsynced and never sends an unpersisted batch after a storage write failure", async () => {
    vi.useFakeTimers();
    const memory = memoryStorage();
    let fail = false;
    const h = await harness({
      storage: {
        read: memory.storage.read,
        write: async (envelope) => {
          if (fail) throw new Error("quota");
          await memory.storage.write(envelope);
        },
      },
    });
    fail = true;
    act(() =>
      h.result.current.dispatch({
        type: "commit",
        mutations: [rename("Keep me")],
      }),
    );
    await tick(1000);
    expect(h.result.current.state.status).toBe("UNSYNCED");
    expect(h.result.current.state.document.scenes[0].name).toBe("Keep me");
    expect(h.requests).toHaveLength(0);
    fail = false;
    act(() => h.result.current.dispatch({ type: "retry" }));
    await tick(100);
    expect(h.requests).toHaveLength(1);
    expect(await memory.storage.read(identity)).toMatchObject({
      pending: h.requests[0],
    });
  });

  it("splits more than 100 pending commands into valid sequential CAS batches", async () => {
    vi.useFakeTimers();
    const h = await harness();
    act(() => {
      for (let i = 1; i <= 101; i++)
        h.result.current.dispatch({
          type: "commit",
          mutations: [rename(`Edit ${i}`)],
        });
    });
    await tick(100);
    expect(h.requests[0].mutations).toHaveLength(100);
    await act(async () =>
      h.responses[0].resolve({ revision: 1, document: project("Edit 100") }),
    );
    expect(h.result.current.state.document.scenes[0].name).toBe("Edit 101");
    await tick(100);
    expect(h.requests[1]).toMatchObject({
      baseRevision: 1,
      mutations: [rename("Edit 101")],
    });
  });
});

describe("Studio browser boundaries", () => {
  it("hands off queued native IndexedDB writes between default provider sessions", async () => {
    const { page, close } = await studioBrowser();
    try {
      await page.evaluate(() => {
        const fixture = window as unknown as StudioBrowserWindow;
        let releaseFirst!: () => void;
        let releaseLast!: () => void;
        const firstGate = new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        const lastGate = new Promise<void>((resolve) => {
          releaseLast = resolve;
        });
        fixture.handoff = {
          releaseFirst,
          releaseLast,
          firstPersisted: false,
          lastStarted: false,
        };
        const write = fixture.nativeStorage.write;
        fixture.nativeStorage.write = async (envelope) => {
          const mutation = envelope.pending?.mutations.at(-1);
          const name =
            mutation?.type === "scene.rename" ? mutation.name : undefined;
          if (name === "First") {
            await write(envelope);
            fixture.handoff.firstPersisted = true;
            await firstGate;
            return;
          }
          if (name === "Latest") {
            fixture.handoff.lastStarted = true;
            await lastGate;
          }
          await write(envelope);
        };
        fixture.mountStudio();
      });
      await page.waitForFunction(
        () => (window as unknown as StudioBrowserWindow).studio?.state.ready,
      );
      await page.evaluate(
        (mutation) =>
          (window as unknown as StudioBrowserWindow).studio.dispatch({
            type: "commit",
            mutations: [mutation],
          }),
        rename("First"),
      );
      await page.waitForFunction(
        () => (window as unknown as StudioBrowserWindow).handoff.firstPersisted,
      );
      await page.evaluate(
        (mutation) =>
          (window as unknown as StudioBrowserWindow).studio.dispatch({
            type: "commit",
            mutations: [mutation],
          }),
        rename("Latest"),
      );
      await page.waitForFunction(
        () =>
          (window as unknown as StudioBrowserWindow).studio.state.document
            .scenes[0].name === "Latest",
      );
      await page.evaluate(() => {
        const fixture = window as unknown as StudioBrowserWindow;
        fixture.unmountStudio();
        fixture.mountStudio();
      });
      await page.waitForFunction(
        () => !(window as unknown as StudioBrowserWindow).studio.state.ready,
      );
      await page.evaluate(() =>
        (window as unknown as StudioBrowserWindow).handoff.releaseFirst(),
      );
      await page.waitForFunction(
        () => (window as unknown as StudioBrowserWindow).handoff.lastStarted,
      );
      expect(
        await page.evaluate(
          () => (window as unknown as StudioBrowserWindow).studio.state.ready,
        ),
      ).toBe(false);
      await page.evaluate(() =>
        (window as unknown as StudioBrowserWindow).handoff.releaseLast(),
      );
      await page.waitForFunction(
        () => (window as unknown as StudioBrowserWindow).studio.state.ready,
      );
      expect(
        await page.evaluate(
          () =>
            (window as unknown as StudioBrowserWindow).studio.state.document,
        ),
      ).toEqual(project("Latest"));
      expect(
        await page.evaluate(
          (scope) =>
            (window as unknown as StudioBrowserWindow).nativeStorage.read(
              scope,
            ),
          identity,
        ),
      ).toMatchObject({
        pending: { mutations: [rename("First"), rename("Latest")] },
      });
    } finally {
      await close();
    }
  }, 75_000);

  it("edits and autosaves with default dependencies on an ordinary HTTP/IP origin", async () => {
    const { page, close } = await studioBrowser();
    try {
      const requests: ApplyMutationBatchInput[] = [];
      await page.route(
        "http://192.0.2.50/games/game/engine-project/mutations",
        async (route) => {
          const batch = route
            .request()
            .postDataJSON() as ApplyMutationBatchInput;
          requests.push(batch);
          const last = batch.mutations.at(-1)!;
          if (last.type !== "scene.rename")
            throw new Error("Expected rename fixture");
          await route.fulfill({
            json: {
              status: "SUPPORTED",
              project: project(last.name),
              revision: {
                revisionNumber: batch.baseRevision + 1,
                schemaVersion: 2,
                contentHash: "a".repeat(64),
                byteSize: 100,
                retention: "STANDARD",
                createdAt: "2026-09-09T00:00:00.000Z",
              },
            },
          });
        },
      );
      expect(
        await page.evaluate(() => ({
          secure: isSecureContext,
          randomUUID: typeof crypto.randomUUID,
        })),
      ).toEqual({ secure: false, randomUUID: "undefined" });
      await page.evaluate(() =>
        (window as unknown as StudioBrowserWindow).mountStudio(),
      );
      await page.waitForFunction(
        () => (window as unknown as StudioBrowserWindow).studio?.state.ready,
      );
      for (const name of ["HTTP edit", "Second edit"]) {
        const error = await page.evaluate((mutation) => {
          try {
            (window as unknown as StudioBrowserWindow).studio.dispatch({
              type: "commit",
              mutations: [mutation],
            });
            return null;
          } catch (error) {
            return String(error);
          }
        }, rename(name));
        expect(error).toBeNull();
        await page.waitForFunction((expectedName) => {
          const state = (window as unknown as StudioBrowserWindow).studio.state;
          return (
            state.status === "UNSYNCED" ||
            (state.status === "SAVED" &&
              state.document.scenes[0].name === expectedName)
          );
        }, name);
        expect(
          await page.evaluate(() => ({
            status: (window as unknown as StudioBrowserWindow).studio.state
              .status,
            recoveryError: (window as unknown as StudioBrowserWindow).studio
              .state.recoveryError,
          })),
        ).toEqual({ status: "SAVED", recoveryError: false });
      }
      expect(requests).toHaveLength(2);
      expect(requests[0].mutationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(requests[1].mutationId).not.toBe(requests[0].mutationId);
      const recovered = await page.evaluate(
        (scope) =>
          (window as unknown as StudioBrowserWindow).nativeStorage.read(scope),
        identity,
      );
      expect(recovered).toMatchObject({
        acknowledged: { revision: 2, document: project("Second edit") },
        pending: null,
      });
    } finally {
      await close();
    }
  }, 75_000);

  it("posts only the typed batch with session credentials and retains structured 409 details", async () => {
    const { state } = await modules();
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    const fetcher: typeof fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(
        JSON.stringify({
          statusCode: 409,
          code: "PROJECT_REVISION_CONFLICT",
          currentRevision: 8,
        }),
        { status: 409 },
      );
    };
    const transport = state.createStudioTransport(
      fetcher,
      "https://api.example.test",
    );
    await expect(
      transport("game/id", {
        baseRevision: 0,
        mutationId: "retry-id",
        mutations: [rename("Local")],
      }),
    ).rejects.toMatchObject({ currentRevision: 8 });
    expect(requests).toEqual([
      {
        url: "https://api.example.test/games/game%2Fid/engine-project/mutations",
        options: expect.objectContaining({
          method: "POST",
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            baseRevision: 0,
            mutationId: "retry-id",
            mutations: [rename("Local")],
          }),
        }),
      },
    ]);
  });

  it("rejects malformed acknowledgements instead of clearing pending work", async () => {
    const { state } = await modules();
    for (const body of [
      { status: "SUPPORTED", project: project(), revision: null },
      { status: "SUPPORTED", project: {}, revision: { revisionNumber: 1 } },
    ]) {
      const transport = state.createStudioTransport(
        async () => new Response(JSON.stringify(body)),
        "https://api.example.test",
      );
      await expect(
        transport("game", {
          baseRevision: 0,
          mutationId: "id",
          mutations: [rename("Name")],
        }),
      ).rejects.toThrow();
    }
  });

  it("round-trips complete isolated recovery envelopes in native IndexedDB across connections", async () => {
    const { recovery } = await modules();
    const { chromium } = await import("@playwright/test");
    const { existsSync } = await import("node:fs");
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync("/usr/bin/google-chrome")
          ? "/usr/bin/google-chrome"
          : undefined),
    });
    try {
      const page = await browser.newPage();
      await page.route("http://studio.test/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "<html></html>" }),
      );
      await page.goto("http://studio.test/");
      const envelope: RecoveryEnvelope = {
        version: 1,
        ...identity,
        acknowledged: { revision: 0, document: project() },
        pending: {
          baseRevision: 0,
          mutationId: "durable-id",
          mutations: [rename("Local")],
        },
        queued: [],
        conflict: false,
        conflictRevision: null,
        timestamp: 123,
      };
      const result = await page.evaluate(
        async ({ source, envelope }) => {
          const create = (0, eval)(
            `(${source})`,
          ) as typeof recovery.createIndexedDbRecoveryStorage;
          const first = create({
            factory: indexedDB,
            databaseName: "studio-test",
          });
          await first.write(envelope);
          const second = create({
            factory: indexedDB,
            databaseName: "studio-test",
          });
          const recovered = await second.read(envelope);
          const foreign = await second.read({
            ...envelope,
            userId: "someone-else",
          });
          const saved = {
            ...envelope,
            pending: null,
            acknowledged: { ...envelope.acknowledged, revision: 1 },
          };
          await second.write(saved);
          return { recovered, foreign, saved: await first.read(envelope) };
        },
        {
          source: recovery.createIndexedDbRecoveryStorage.toString(),
          envelope,
        },
      );
      expect(result.recovered).toEqual(envelope);
      expect(result.foreign).toBeNull();
      expect(result.saved).toMatchObject({
        pending: null,
        acknowledged: { revision: 1 },
      });
    } finally {
      await browser.close();
    }
    // Includes browser process startup as well as the native storage assertions.
  }, 45_000);
});
