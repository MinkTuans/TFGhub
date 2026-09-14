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
  moderationReason: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DiscoverGamesInput = z.object({
  query: z.string().trim().max(200).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const PublicGameSummary = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  developer: z.object({ displayName: z.string() }),
  createdAt: z.string().datetime(),
  playUrl: z.string().nullable().optional(),
});

export const DiscoverGamesResponse = z.object({
  games: z.array(PublicGameSummary),
  nextCursor: z.string().nullable(),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInput>;
export type GameSummary = z.infer<typeof GameSummary>;
export type DiscoverGamesInput = z.infer<typeof DiscoverGamesInput>;
export type PublicGameSummary = z.infer<typeof PublicGameSummary>;
export type DiscoverGamesResponse = z.infer<typeof DiscoverGamesResponse>;
