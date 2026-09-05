import { z } from 'zod';

export const CreateGameInput = z.object({
  title: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).default(''),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']).default('GUEST_ALLOWED'),
});

export const UpdateGameInput = CreateGameInput.pick({
  title: true,
  description: true,
  accessMode: true,
}).partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const GameSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(['DRAFT', 'PUBLIC', 'UNLISTED']),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']),
  moderationState: z.enum(['CLEAR', 'FLAGGED', 'QUARANTINED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInput>;
export type GameSummary = z.infer<typeof GameSummary>;
