import {
  ApplyMutationBatchInput,
  applyProjectMutations,
} from "@indieforge/contracts";
import { appendHistory, historyEntry } from "./studio-history";
import { restoreRecovery } from "./studio-recovery";
import type {
  StudioAcknowledgement,
  StudioMutation,
  StudioState,
} from "./studio-state";

export type StudioCommand =
  | { type: "commit"; mutations: StudioMutation[]; gestureId?: string }
  | { type: "preview"; mutations: StudioMutation[]; gestureId?: string }
  | { type: "commit-preview" | "cancel-preview" | "undo" | "redo" | "retry" };
type Metadata = { mutationId: string; timestamp: number };
export type StudioAction =
  | (Exclude<StudioCommand, { type: "preview" }> & Metadata)
  | Extract<StudioCommand, { type: "preview" }>
  | { type: "restore"; recovery: unknown }
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

function enqueue(
  state: StudioState,
  commands: StudioMutation[],
  meta: Metadata,
): StudioState {
  let pending = state.pending;
  let queued = [...state.queued, ...commands];
  if (!pending) {
    pending = ApplyMutationBatchInput.parse({
      baseRevision: state.acknowledged.revision,
      mutationId: meta.mutationId,
      mutations: queued.slice(0, 100),
    });
    queued = queued.slice(100);
  } else if (!state.attempted) {
    const available = 100 - pending.mutations.length;
    pending = {
      ...pending,
      mutations: [...pending.mutations, ...queued.slice(0, available)],
    };
    queued = queued.slice(available);
  }
  return {
    ...state,
    pending,
    queued,
    preview: null,
    timestamp: meta.timestamp,
    version: state.version + 1,
    status: ["CONFLICT", "UNSYNCED", "SAVING"].includes(state.status)
      ? state.status
      : "DIRTY",
  };
}

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
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
      return {
        ...state,
        status: state.pending ? "DIRTY" : "SAVED",
        timestamp: action.timestamp,
        version: state.version + 1,
      };
    case "preview": {
      if (!state.ready) return state;
      const mutations = ApplyMutationBatchInput.shape.mutations.parse(
        action.mutations,
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
      if (!state.ready) return state;
      const mutations = ApplyMutationBatchInput.shape.mutations.parse(
        action.mutations,
      );
      const document = applyProjectMutations(state.document, mutations);
      const entry = historyEntry(state.document, document, action.gestureId);
      if (!entry.redo.length) return { ...state, preview: null };
      return {
        ...enqueue(state, mutations, action),
        document,
        history: appendHistory(state.history, entry),
      };
    }
    case "undo":
    case "redo": {
      if (!state.ready) return state;
      const undo = action.type === "undo";
      const source = undo ? state.history.past : state.history.future;
      const entry = source.at(-1);
      if (!entry) return state;
      const commands = undo ? entry.undo : entry.redo;
      return {
        ...enqueue(state, commands, action),
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
