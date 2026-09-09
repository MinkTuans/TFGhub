import {
  ApplyMutationBatchInput,
  applyProjectMutations,
} from "@indieforge/contracts";
import {
  createStudioState,
  type StudioAcknowledgement,
  type StudioIdentity,
  type StudioMutation,
  type StudioState,
} from "./studio-state";

export interface RecoveryEnvelope extends StudioIdentity {
  version: 1;
  acknowledged: StudioAcknowledgement;
  pending: ApplyMutationBatchInput | null;
  queued: StudioMutation[];
  conflict: boolean;
  conflictRevision: number | null;
  timestamp: number;
}
export interface RecoveryStorage {
  read(identity: StudioIdentity): Promise<unknown>;
  write(envelope: RecoveryEnvelope): Promise<void>;
}

// I/O ordering outlives a provider mount. Only unfinished operation tails are
// retained; separate storage backends and recovery keys are independent.
const recoveryOperations = new WeakMap<
  RecoveryStorage,
  Map<string, Promise<void>>
>();

export function withRecoveryStorage<T>(
  storage: RecoveryStorage,
  identity: StudioIdentity,
  operation: () => Promise<T>,
): Promise<T> {
  let operations = recoveryOperations.get(storage);
  if (!operations) {
    operations = new Map();
    recoveryOperations.set(storage, operations);
  }
  const key = JSON.stringify([identity.userId, identity.projectId]);
  const result = (operations.get(key) ?? Promise.resolve()).then(operation);
  // A failed earlier write must not prevent a later snapshot or read from running.
  const tail = result.then(
    () => {},
    () => {},
  );
  operations.set(key, tail);
  void tail.then(() => {
    if (operations.get(key) === tail) {
      operations.delete(key);
      if (operations.size === 0) recoveryOperations.delete(storage);
    }
  });
  return result;
}

export function recoveryEnvelope(state: StudioState): RecoveryEnvelope {
  return structuredClone({
    version: 1,
    ...state.identity,
    acknowledged: state.acknowledged,
    pending: state.pending,
    queued: state.queued,
    conflict: state.status === "CONFLICT",
    conflictRevision:
      state.status === "CONFLICT" ? state.conflictRevision : null,
    timestamp: state.timestamp,
  });
}

/** Invalid/foreign records are preserved in storage and block edits, never erased. */
export function restoreRecovery(
  initial: StudioState,
  raw: unknown,
): StudioState {
  if (raw === null)
    return { ...initial, ready: true, recoveryError: false, status: "SAVED" };
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid recovery envelope");
  const record = raw as RecoveryEnvelope;
  if (
    record.version !== 1 ||
    record.userId !== initial.identity.userId ||
    record.projectId !== initial.identity.projectId ||
    record.gameId !== initial.identity.gameId ||
    typeof record.conflict !== "boolean" ||
    !Number.isFinite(record.timestamp) ||
    record.timestamp < 0 ||
    (record.conflictRevision !== null &&
      (!Number.isInteger(record.conflictRevision) ||
        record.conflictRevision < 0))
  )
    throw new Error("Invalid recovery envelope identity or version");
  const recovered = createStudioState(
    initial.identity,
    record.acknowledged,
    initial.history.limit,
  );
  const pending =
    record.pending === null
      ? null
      : structuredClone(ApplyMutationBatchInput.parse(record.pending));
  const queued = structuredClone(
    ApplyMutationBatchInput.shape.mutations.element
      .array()
      .parse(record.queued),
  );
  if (
    (!pending && record.conflict) ||
    (!record.conflict && record.conflictRevision !== null) ||
    (pending && pending.baseRevision !== recovered.acknowledged.revision)
  )
    throw new Error("Invalid recovery batch base");
  // A lost response must replay against its original base even if the fresh GET
  // is newer. The server's idempotency record decides whether it already saved.
  if (
    !pending &&
    !queued.length &&
    initial.acknowledged.revision >= recovered.acknowledged.revision
  )
    return { ...initial, ready: true, recoveryError: false, status: "SAVED" };
  return {
    ...recovered,
    pending,
    queued,
    attempted: pending !== null,
    document: applyProjectMutations(recovered.document, [
      ...(pending?.mutations ?? []),
      ...queued,
    ]),
    status: record.conflict
      ? "CONFLICT"
      : pending
        ? "DIRTY"
        : queued.length
          ? "UNSYNCED"
          : "SAVED",
    batchError: !pending && queued.length > 0,
    conflictRevision: record.conflictRevision,
    timestamp: record.timestamp,
  };
}

/** Opens lazily, so importing or server-rendering the provider needs no browser APIs. */
export function createIndexedDbRecoveryStorage(
  options: {
    factory?: IDBFactory;
    databaseName?: string;
  } = {},
): RecoveryStorage {
  const databaseName = options.databaseName ?? "tfg-studio-recovery";
  const storeName = "projects";
  function transaction<T>(
    identity: StudioIdentity,
    envelope?: RecoveryEnvelope,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const factory = options.factory ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const opening = factory.open(databaseName, 1);
      let abandoned = false;
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(storeName))
          opening.result.createObjectStore(storeName);
      };
      opening.onerror = () =>
        reject(opening.error ?? new Error("Recovery database failed to open"));
      opening.onblocked = () => {
        abandoned = true;
        reject(new Error("Recovery database is blocked"));
      };
      opening.onsuccess = () => {
        const database = opening.result;
        if (abandoned) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        try {
          const tx = database.transaction(
            storeName,
            envelope ? "readwrite" : "readonly",
          );
          const store = tx.objectStore(storeName);
          const key = JSON.stringify([identity.userId, identity.projectId]);
          const request = envelope ? store.put(envelope, key) : store.get(key);
          tx.oncomplete = () => {
            database.close();
            resolve((envelope ? undefined : (request.result ?? null)) as T);
          };
          tx.onabort = () => {
            database.close();
            reject(tx.error ?? new Error("Recovery transaction aborted"));
          };
          tx.onerror = () => {
            database.close();
            reject(
              tx.error ??
                request.error ??
                new Error("Recovery transaction failed"),
            );
          };
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
  }
  return {
    read: (identity) => transaction<unknown>(identity),
    write: (envelope) => transaction<void>(envelope, envelope),
  };
}

// Construction has no browser side effects. Stable identity lets sequential
// default provider sessions share only their in-progress recovery I/O ordering.
export const browserRecoveryStorage = createIndexedDbRecoveryStorage();
