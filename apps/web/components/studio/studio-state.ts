import {
  ApplyMutationBatchInput,
  EngineProjectReadResponse,
  EngineProjectV2,
  ProjectRevisionConflictResponse,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { ApiError, resolveApiBaseUrl } from "../../lib/api-client";
import type { StudioHistory } from "./studio-history";

export type StudioMutation = ApplyMutationBatchInput["mutations"][number];
export type StudioStatus =
  "SAVED" | "DIRTY" | "SAVING" | "UNSYNCED" | "CONFLICT";
export type StudioIdentity = {
  userId: string;
  gameId: string;
  projectId: string;
};
export type StudioAcknowledgement = {
  revision: number;
  document: EngineProjectV2Type;
};
export type StudioPreview = {
  document: EngineProjectV2Type;
  mutations: StudioMutation[];
  gestureId?: string;
};

export interface StudioState {
  identity: StudioIdentity;
  acknowledged: StudioAcknowledgement;
  document: EngineProjectV2Type;
  history: StudioHistory;
  preview: StudioPreview | null;
  pending: ApplyMutationBatchInput | null;
  queued: StudioMutation[];
  /** An attempted batch must never change, even if its response was lost. */
  attempted: boolean;
  status: StudioStatus;
  conflictRevision: number | null;
  recoveryError: boolean;
  ready: boolean;
  timestamp: number;
  /** Only durable transitions advance this counter; pointer previews do not. */
  version: number;
  persistedVersion: number;
  recoveryAttempt: number;
}

export function createStudioState(
  identity: StudioIdentity,
  initial: StudioAcknowledgement,
  historyLimit = 100,
): StudioState {
  const document = structuredClone(EngineProjectV2.parse(initial.document));
  if (
    document.projectId !== identity.projectId ||
    !identity.userId ||
    !identity.gameId
  )
    throw new Error("Studio project identity does not match");
  if (
    !Number.isInteger(initial.revision) ||
    initial.revision < 0 ||
    initial.revision > 2_147_483_647
  )
    throw new Error("Invalid acknowledged revision");
  if (!Number.isInteger(historyLimit) || historyLimit < 1)
    throw new Error("History limit must be a positive integer");
  return {
    identity: { ...identity },
    acknowledged: { revision: initial.revision, document },
    document: structuredClone(document),
    history: { past: [], future: [], limit: historyLimit },
    preview: null,
    pending: null,
    queued: [],
    attempted: false,
    status: "SAVED",
    conflictRevision: null,
    recoveryError: false,
    ready: true,
    timestamp: 0,
    version: 0,
    persistedVersion: -1,
    recoveryAttempt: 0,
  };
}

export interface StudioClock {
  now(): number;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export type StudioTransport = (
  gameId: string,
  batch: ApplyMutationBatchInput,
) => Promise<StudioAcknowledgement>;

export class StudioConflictError extends ApiError {
  constructor(readonly currentRevision: number | null) {
    super(409, "Project revision conflict");
  }
}

/** Recovery documents and user IDs never enter this HTTP payload. */
export function createStudioTransport(
  fetcher: typeof fetch = (...args) => fetch(...args),
  baseUrl?: string,
): StudioTransport {
  return async (gameId, batch) => {
    const response = await fetcher(
      `${(baseUrl ?? resolveApiBaseUrl()).replace(/\/$/, "")}/games/${encodeURIComponent(gameId)}/engine-project/mutations`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ApplyMutationBatchInput.parse(batch)),
      },
    );
    if (response.status === 409) {
      const conflict = ProjectRevisionConflictResponse.safeParse(
        await response.json().catch(() => null),
      );
      throw new StudioConflictError(
        conflict.success ? conflict.data.currentRevision : null,
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        `Request failed (${response.status})`,
      );
    const result = EngineProjectReadResponse.parse(await response.json());
    if (result.status !== "SUPPORTED" || !result.revision)
      throw new Error("Missing supported project acknowledgement");
    return {
      revision: result.revision.revisionNumber,
      document: EngineProjectV2.parse(result.project),
    };
  };
}
