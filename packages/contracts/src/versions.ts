import { z } from 'zod';

export const GameVersionStatus = z.enum([
  'UPLOADING',
  'SCANNING',
  'READY',
  'REJECTED',
]);

export const CreateGameVersionInput = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+\.zip$/),
  byteSize: z.number().int().positive().max(20 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const CompleteGameVersionInput = z.object({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const PublishGameInput = z.object({
  versionId: z.string().min(1).max(64),
});

export const RollbackGameInput = PublishGameInput;

export const GameVersionSummary = z.object({
  id: z.string(),
  gameId: z.string(),
  status: GameVersionStatus,
  filename: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  findings: z.string(),
  createdAt: z.string().datetime(),
});

export const CreateGameVersionResponse = GameVersionSummary.extend({
  uploadUrl: z.string().url(),
});

export type GameVersionStatus = z.infer<typeof GameVersionStatus>;
export type CreateGameVersionInput = z.infer<typeof CreateGameVersionInput>;
export type CompleteGameVersionInput = z.infer<typeof CompleteGameVersionInput>;
export type PublishGameInput = z.infer<typeof PublishGameInput>;
export type RollbackGameInput = z.infer<typeof RollbackGameInput>;
export type GameVersionSummary = z.infer<typeof GameVersionSummary>;
export type CreateGameVersionResponse = z.infer<typeof CreateGameVersionResponse>;
