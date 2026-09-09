"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EngineProjectV2 } from "@indieforge/contracts";
import { ApiError } from "../../lib/api-client";
import {
  createStudioState,
  createStudioTransport,
  StudioConflictError,
  type StudioAcknowledgement,
  type StudioClock,
  type StudioIdentity,
  type StudioState,
  type StudioTransport,
} from "./studio-state";
import { studioReducer, type StudioCommand } from "./studio-reducer";
import {
  browserRecoveryStorage,
  recoveryEnvelope,
  withRecoveryStorage,
  type RecoveryStorage,
} from "./studio-recovery";

export interface StudioProviderProps {
  identity: StudioIdentity;
  initial: StudioAcknowledgement;
  children?: ReactNode;
  /** Dependencies are supplied by client consumers/tests, never across RSC. */
  storage?: RecoveryStorage;
  transport?: StudioTransport;
  clock?: StudioClock;
  newMutationId?: () => string;
  debounceMs?: number;
  historyLimit?: number;
}
const StudioContext = createContext<{
  state: StudioState;
  dispatch: (command: StudioCommand) => void;
} | null>(null);

function createMutationId(): string {
  // getRandomValues also works on ordinary HTTP/IP origins. UUID v4 keeps
  // 122 random bits after setting its version and variant.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function StudioProvider(props: StudioProviderProps) {
  // A navigation/account change starts a separate lifecycle and cancels old timers.
  const key = JSON.stringify([
    props.identity.userId,
    props.identity.projectId,
    props.identity.gameId,
  ]);
  return <StudioSession key={key} {...props} />;
}

function StudioSession(props: StudioProviderProps) {
  const [dependencies] = useState(() => ({
    storage: props.storage ?? browserRecoveryStorage,
    transport: props.transport ?? createStudioTransport(),
    clock: props.clock ?? {
      now: () => Date.now(),
      setTimeout: (callback: () => void, ms: number) =>
        setTimeout(callback, ms),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) =>
        clearTimeout(timer),
    },
    newMutationId: props.newMutationId ?? createMutationId,
    debounceMs: props.debounceMs ?? 500,
  }));
  const { storage, transport, clock, newMutationId, debounceMs } = dependencies;
  const [state, reduce] = useReducer(studioReducer, props, (initialProps) => ({
    ...createStudioState(
      initialProps.identity,
      initialProps.initial,
      initialProps.historyLimit,
    ),
    ready: false,
  }));
  const mounted = useRef(false);
  const scheduledVersion = useRef(-1);
  const inFlight = useRef<string | null>(null);
  const dispatch = useCallback(
    (command: StudioCommand) => {
      if (command.type === "preview") reduce(command);
      else
        reduce({
          ...command,
          mutationId: newMutationId(),
          timestamp: clock.now(),
        });
    },
    [clock, newMutationId],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { identity, ready, recoveryAttempt } = state;
  useEffect(() => {
    if (ready) return;
    let active = true;
    withRecoveryStorage(storage, identity, () => storage.read(identity)).then(
      (recovery) => {
        if (active) reduce({ type: "restore", recovery });
      },
      () => {
        if (active) reduce({ type: "recovery-failed" });
      },
    );
    return () => {
      active = false;
    };
  }, [identity, ready, recoveryAttempt, storage]);

  useEffect(() => {
    if (!state.ready || scheduledVersion.current === state.version) return;
    scheduledVersion.current = state.version;
    const envelope = recoveryEnvelope(state);
    // Enqueue now, so replacement hydration also waits for outgoing snapshots.
    void withRecoveryStorage(storage, state.identity, () =>
      storage.write(envelope),
    ).then(
      () => {
        if (mounted.current)
          reduce({ type: "persisted", version: state.version });
      },
      () => {
        if (mounted.current)
          reduce({ type: "storage-failed", version: state.version });
      },
    );
  }, [state, storage]);

  const { status, version, persistedVersion } = state;
  useEffect(() => {
    if (!ready || status !== "DIRTY" || persistedVersion !== version) return;
    const timer = clock.setTimeout(
      () => reduce({ type: "save-started", version }),
      debounceMs,
    );
    return () => clock.clearTimeout(timer);
  }, [clock, debounceMs, ready, status, version, persistedVersion]);

  useEffect(() => {
    if (
      state.status !== "SAVING" ||
      state.persistedVersion !== state.version ||
      !state.pending ||
      inFlight.current
    )
      return;
    const batch = structuredClone(state.pending);
    inFlight.current = batch.mutationId;
    void (async () => {
      try {
        const result = await transport(state.identity.gameId, batch);
        const document = structuredClone(
          EngineProjectV2.parse(result.document),
        );
        if (
          document.projectId !== state.identity.projectId ||
          result.revision !== batch.baseRevision + 1
        )
          throw new Error(
            "Invalid mutation acknowledgement identity or revision",
          );
        if (mounted.current)
          reduce({
            type: "acknowledged",
            savedMutationId: batch.mutationId,
            acknowledged: { revision: result.revision, document },
            mutationId: newMutationId(),
            timestamp: clock.now(),
          });
      } catch (error) {
        if (mounted.current)
          reduce({
            type: "save-failed",
            savedMutationId: batch.mutationId,
            conflict: error instanceof ApiError && error.status === 409,
            currentRevision:
              error instanceof StudioConflictError
                ? error.currentRevision
                : null,
            timestamp: clock.now(),
          });
      } finally {
        inFlight.current = null;
      }
    })();
  }, [state, transport, newMutationId, clock]);

  return (
    <StudioContext value={{ state, dispatch }}>{props.children}</StudioContext>
  );
}

export function useStudio() {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error("useStudio requires StudioProvider");
  return studio;
}
