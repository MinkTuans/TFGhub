import { z } from 'zod';
import {
  ProjectMutation,
  PROJECT_MUTATION_BATCH_LIMIT,
} from '@indieforge/engine-core';

export const ApplyMutationBatchInput = z
  .object({
    // Leave room for the next PostgreSQL Int revision number.
    baseRevision: z.number().int().nonnegative().max(2_147_483_646),
    mutationId: z.string().min(1).max(128).regex(/^\S+$/),
    mutations: z
      .array(ProjectMutation)
      .min(1)
      .max(PROJECT_MUTATION_BATCH_LIMIT),
  })
  .strict();

export type ApplyMutationBatchInput = z.infer<typeof ApplyMutationBatchInput>;

// Matches the API JSON parser for all JSON endpoints; Studio reserves the
// largest legal mutation envelope so generated undo/redo can always be sent.
export const JSON_REQUEST_BYTE_LIMIT = 4 * 1024 * 1024;
export function mutationBatchRequestBytes(
  mutations: ProjectMutation[],
): number {
  const body = JSON.stringify({
    baseRevision: 2_147_483_646,
    // Each non-whitespace control character occupies six escaped JSON bytes.
    mutationId: '\0'.repeat(128),
    mutations,
  });
  return new TextEncoder().encode(body).byteLength;
}

const RequiredUnknown = z.unknown().refine((value) => value !== undefined, {
  message: 'A project document is required',
});

export const EngineProjectRevisionSummary = z.object({
  revisionNumber: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative(),
  retention: z.enum(['STANDARD', 'PINNED']),
  createdAt: z.string().datetime(),
});

export const EngineProjectReadResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('SUPPORTED'),
    project: RequiredUnknown,
    revision: EngineProjectRevisionSummary.nullable(),
  }),
  z.object({
    status: z.literal('READ_ONLY'),
    reason: z.enum([
      'UNSUPPORTED_FUTURE_SCHEMA',
      'UNSUPPORTED_LEGACY_SOURCE',
      'INVALID_PROJECT',
    ]),
    raw: RequiredUnknown,
    schemaVersion: z.number().int().positive().nullable(),
    diagnostics: z.array(z.string()),
  }),
]);

export const SaveEngineProjectInput = z.object({
  baseRevision: z.number().int().nonnegative(),
  project: RequiredUnknown,
});

export const ProjectRevisionConflictResponse = z.object({
  statusCode: z.literal(409),
  code: z.literal('PROJECT_REVISION_CONFLICT'),
  currentRevision: z.number().int().nonnegative(),
});

export type EngineProjectRevisionSummary = z.infer<
  typeof EngineProjectRevisionSummary
>;
export type EngineProjectReadResponse = z.infer<
  typeof EngineProjectReadResponse
>;
export type SaveEngineProjectInput = z.infer<typeof SaveEngineProjectInput>;
export type ProjectRevisionConflictResponse = z.infer<
  typeof ProjectRevisionConflictResponse
>;
