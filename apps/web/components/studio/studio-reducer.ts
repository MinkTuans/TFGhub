import {
  ApplyMutationBatchInput,
  applyProjectMutations,
  JSON_REQUEST_BYTE_LIMIT,
  mutationBatchRequestBytes,
} from "@indieforge/contracts";
import { prepareStudioCommit, StudioMutationSizeError } from "./studio-history";
import { restoreRecovery } from "./studio-recovery";
import {
  createStudioState,
  type StudioConflictResolution,
  type StudioAcknowledgement,
  type StudioMutation,
  type StudioState,
} from "./studio-state";

export type StudioCommand =
  | { type: "resolve-conflict"; strategy: StudioConflictResolution }
  | { type: "commit"; mutations: StudioMutation[]; gestureId?: string }
  | { type: "preview"; mutations: StudioMutation[]; gestureId?: string }
  | { type: "commit-preview" | "cancel-preview" | "undo" | "redo" | "retry" };
type Metadata = { mutationId: string; timestamp: number };
export type StudioAction =
  | (Exclude<StudioCommand, { type: "preview" }> & Metadata)
  | Extract<StudioCommand, { type: "preview" }>
  | { type: "restore"; recovery: unknown }
  | { type: "conflict-resolved"; version: number; resolved: StudioState }
  | { type: "resolution-failed"; version: number; message: string }
  | { type: "recovery-failed" }
  | { type: "persisted" | "storage-failed"; version: number }
  | { type: "save-started"; version: number }
  | ({
      type: "acknowledged";
      savedMutationId: string;
      acknowledged: StudioAcknowledgement;
    } & Metadata)
  | {
      type: "save-failed";
      savedMutationId: string;
      conflict: boolean;
      currentRevision: number | null;
      timestamp: number;
    };

function validPrefix(
  base: StudioAcknowledgement["document"],
  commands: StudioMutation[],
  limit: number,
  prefix: StudioMutation[] = [],
) {
  // JSON array growth is additive. Size each candidate once, then apply the
  // existing semantic-prefix search only inside the transportable prefix.
  const envelopeBytes = mutationBatchRequestBytes([]);
  let bytes = mutationBatchRequestBytes(prefix);
  let count = 0;
  while (count < Math.min(commands.length, limit)) {
    const added =
      mutationBatchRequestBytes([commands[count]]) -
      envelopeBytes +
      (prefix.length + count > 0 ? 1 : 0);
    if (bytes + added > JSON_REQUEST_BYTE_LIMIT) break;
    bytes += added;
    count += 1;
  }
  for (; count > 0; count -= 1) {
    try {
      applyProjectMutations(base, commands.slice(0, count));
      return count;
    } catch {
      /* A later command may complete an otherwise invalid edit. */
    }
  }
  return 0;
}

function enqueue(
  state: StudioState,
  commands: StudioMutation[],
  meta: Metadata,
): StudioState {
  let pending = state.pending;
  // Zod's opaque Custom config retains nested references. Queue ownership must
  // be separate from caller/preview/history payloads, including undo and redo.
  let queued = [...state.queued, ...structuredClone(commands)];
  if (!pending) {
    const count = validPrefix(state.acknowledged.document, queued, 100);
    if (count) {
      pending = ApplyMutationBatchInput.parse({
        baseRevision: state.acknowledged.revision,
        mutationId: meta.mutationId,
        mutations: queued.slice(0, count),
      });
      queued = queued.slice(count);
    }
  } else if (!state.attempted) {
    const available = 100 - pending.mutations.length;
    const base = applyProjectMutations(
      state.acknowledged.document,
      pending.mutations,
    );
    const count = validPrefix(base, queued, available, pending.mutations);
    pending = {
      ...pending,
      mutations: [...pending.mutations, ...queued.slice(0, count)],
    };
    queued = queued.slice(count);
  }
  return {
    ...state,
    pending,
    queued,
    preview: null,
    timestamp: meta.timestamp,
    version: state.version + 1,
    batchError: !pending && queued.length > 0,
    status:
      !pending && queued.length > 0
        ? "UNSYNCED"
        : ["CONFLICT", "UNSYNCED", "SAVING"].includes(state.status)
          ? state.status
          : "DIRTY",
  };
}

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case "resolve-conflict":
      if (!state.ready || state.status !== "CONFLICT" || state.resolution)
        return state;
      return {
        ...state,
        resolution: action.strategy,
        resolutionError: null,
        preview: null,
      };
    case "conflict-resolved":
      return state.resolution && action.version === state.version
        ? action.resolved
        : state;
    case "resolution-failed":
      return state.resolution && action.version === state.version
        ? { ...state, resolution: null, resolutionError: action.message }
        : state;
    case "restore":
      try {
        return {
          ...restoreRecovery(state, action.recovery),
          version: state.version + 1,
        };
      } catch {
        return {
          ...state,
          ready: false,
          status: "UNSYNCED",
          recoveryError: true,
        };
      }
    case "recovery-failed":
      return {
        ...state,
        ready: false,
        status: "UNSYNCED",
        recoveryError: true,
      };
    case "persisted":
      return action.version === state.version
        ? { ...state, persistedVersion: action.version, recoveryError: false }
        : state;
    case "storage-failed":
      return action.version === state.version
        ? {
            ...state,
            status: state.status === "CONFLICT" ? "CONFLICT" : "UNSYNCED",
            recoveryError: true,
          }
        : state;
    case "retry":
      if (!state.ready)
        return { ...state, recoveryAttempt: state.recoveryAttempt + 1 };
      if (state.status !== "UNSYNCED") return state;
      if (state.batchError) return state;
      return {
        ...state,
        status: state.pending ? "DIRTY" : "SAVED",
        timestamp: action.timestamp,
        version: state.version + 1,
      };
    case "preview": {
      if (!state.ready || state.resolution) return state;
      const mutations = structuredClone(
        ApplyMutationBatchInput.shape.mutations.parse(action.mutations),
      );
      return {
        ...state,
        preview: {
          document: applyProjectMutations(state.document, mutations),
          mutations,
          gestureId: action.gestureId,
        },
      };
    }
    case "cancel-preview":
      return { ...state, preview: null };
    case "commit-preview":
      return state.preview
        ? studioReducer(state, {
            ...action,
            type: "commit",
            mutations: state.preview.mutations,
            gestureId: state.preview.gestureId,
          })
        : state;
    case "commit": {
      if (!state.ready || state.resolution) return state;
      const mutations = ApplyMutationBatchInput.shape.mutations.parse(
        action.mutations,
      );
      let prepared;
      try {
        prepared = prepareStudioCommit(state, mutations, action.gestureId);
      } catch (error) {
        if (!(error instanceof StudioMutationSizeError)) throw error;
        return { ...state, preview: null, commandError: error.message };
      }
      const { document, history } = prepared;
      if (JSON.stringify(document) === JSON.stringify(state.document))
        return { ...state, preview: null };
      return {
        ...enqueue(state, mutations, action),
        document,
        history,
        commandError: null,
      };
    }
    case "undo":
    case "redo": {
      if (!state.ready || state.resolution) return state;
      const undo = action.type === "undo";
      const source = undo ? state.history.past : state.history.future;
      const entry = source.at(-1);
      if (!entry) return state;
      const commands = undo ? entry.undo : entry.redo;
      return {
        ...enqueue(state, commands, action),
        commandError: null,
        document: applyProjectMutations(state.document, commands),
        history: {
          ...state.history,
          past: undo
            ? state.history.past.slice(0, -1)
            : [...state.history.past, entry].slice(-state.history.limit),
          future: undo
            ? [...state.history.future, entry].slice(-state.history.limit)
            : state.history.future.slice(0, -1),
        },
      };
    }
    case "save-started":
      if (
        state.status !== "DIRTY" ||
        !state.pending ||
        action.version !== state.version ||
        state.persistedVersion !== state.version
      )
        return state;
      return { ...state, status: "SAVING", attempted: true };
    case "save-failed":
      if (action.savedMutationId !== state.pending?.mutationId) return state;
      return {
        ...state,
        status: action.conflict ? "CONFLICT" : "UNSYNCED",
        conflictRevision: action.currentRevision,
        timestamp: action.timestamp,
        version: state.version + 1,
      };
    case "acknowledged": {
      if (action.savedMutationId !== state.pending?.mutationId) return state;
      const queued = state.queued;
      const next = {
        ...state,
        acknowledged: action.acknowledged,
        pending: null,
        queued: [],
        attempted: false,
        document: applyProjectMutations(action.acknowledged.document, queued),
        status: "SAVED" as const,
        timestamp: action.timestamp,
        version: state.version + 1,
      };
      return queued.length ? enqueue(next, queued, action) : next;
    }
  }
}

/** Prepare the entire resolution without changing the retained conflict.
 * Every transportable atomic prefix gets new inverses against the fetched base.
 * Failure anywhere leaves the caller's document and exact command queue intact.
 */
export function prepareConflictResolution(
  state: StudioState,
  head: StudioAcknowledgement,
  strategy: StudioConflictResolution,
  meta: Metadata,
): StudioState {
  let next = createStudioState(state.identity, head, state.history.limit);
  if (
    head.revision <
    Math.max(state.acknowledged.revision, state.conflictRevision ?? 0)
  )
    throw new Error("The fetched project revision is stale");
  const commands = [...(state.pending?.mutations ?? []), ...state.queued];
  if (strategy === "reapply") {
    if (meta.mutationId === state.pending?.mutationId)
      throw new Error("Reapply requires a fresh mutation ID");
    let remaining = commands;
    while (remaining.length) {
      let count = validPrefix(next.document, remaining, 100);
      let prepared;
      while (count) {
        try {
          prepared = prepareStudioCommit(next, remaining.slice(0, count));
          break;
        } catch (error) {
          if (!(error instanceof StudioMutationSizeError)) throw error;
          // Compact commands can have large inverses. Keep separate, replayable
          // history entries when combining them would exceed the request limit.
          count = validPrefix(next.document, remaining, count - 1);
        }
      }
      if (!prepared)
        throw new Error("Local commands cannot be applied to this remote head");
      next = {
        ...next,
        document: prepared.document,
        history: prepared.history,
      };
      remaining = remaining.slice(count);
    }
    if (commands.length) next = enqueue(next, commands, meta);
  }
  return {
    ...next,
    timestamp: meta.timestamp,
    version: state.version + 1,
    persistedVersion: state.version + 1,
  };
}
