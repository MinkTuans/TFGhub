import { z } from "zod";
export type EngagementStats = {
  totalPlays: number;
  uniquePlayers: number;
  averagePlaySeconds: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  ratingDistribution: { stars: number; count: number }[];
  commentCount: number;
  highScore: number | null;
  scoresEnabled: boolean;
};
export type EngagementComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string };
  rating: number | null;
};
export type EngagementComments = { items: EngagementComment[]; total: number };
export type GameAnalytics = {
  game: { id: string; title: string; slug: string; reviewState: string };
  stats: EngagementStats;
  dailyPlays: { date: string; plays: number }[];
  trackingStartedAt: string | null;
};
export type PlaySession = {
  playId: string;
  token: string;
  scoresEnabled: boolean;
  personalBest: number | null;
};
export type GameScoreResult = {
  highScore: number;
  personalBest: number | null;
};
export type EngagementViewer = { rating: number | null };
export const gameRatingInputSchema = z
  .object({ rating: z.number().int().min(1).max(5) })
  .strict();
export const gameCommentInputSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
export const playStartInputSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();
const token = z.string().min(32).max(128);
export const playHeartbeatInputSchema = z
  .object({
    token,
    sequence: z.number().int().min(1).max(2147483647),
    activeSeconds: z.number().int().min(0).max(30),
  })
  .strict();
export const gameScoreInputSchema = z
  .object({ token, score: z.number().int().min(0).max(2147483647) })
  .strict();
export const engagementSettingsInputSchema = z
  .object({ scoresEnabled: z.boolean() })
  .strict();
export const engagementCommentsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
