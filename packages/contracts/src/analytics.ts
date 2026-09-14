import { z } from 'zod';

export const StartPlaySessionInput = z.object({
  visitorId: z.string().trim().min(8).max(64),
  gameSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const PlayHeartbeatInput = z.object({
  eventId: z.string().trim().min(8).max(64),
  visible: z.boolean(),
  active: z.boolean(),
  occurredAt: z.string().datetime(),
});

export const PlaySessionSummary = z.object({
  id: z.string(),
  gameSlug: z.string(),
});

export const GameAnalyticsSummary = z.object({
  gameId: z.string(),
  slug: z.string(),
  title: z.string(),
  validPlays: z.number().int().nonnegative(),
  validActiveMinutes: z.number().nonnegative(),
  score: z.number().nonnegative(),
});

export const StudioAnalyticsResponse = z.object({
  games: z.array(GameAnalyticsSummary),
});

export type StartPlaySessionInput = z.infer<typeof StartPlaySessionInput>;
export type PlayHeartbeatInput = z.infer<typeof PlayHeartbeatInput>;
export type PlaySessionSummary = z.infer<typeof PlaySessionSummary>;
export type GameAnalyticsSummary = z.infer<typeof GameAnalyticsSummary>;
export type StudioAnalyticsResponse = z.infer<typeof StudioAnalyticsResponse>;
