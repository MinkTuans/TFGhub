import { z } from 'zod';

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
