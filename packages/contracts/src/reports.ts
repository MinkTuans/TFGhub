import { z } from 'zod';

export const ReportCategory = z.enum([
  'MALWARE',
  'PROHIBITED',
  'COPYRIGHT',
  'IMPERSONATION',
  'MISLEADING',
]);

export const ReportStatus = z.enum([
  'OPEN',
  'DISMISSED',
  'APPEALED',
  'RESTORED',
]);

export const CreateReportInput = z.object({
  category: ReportCategory,
  evidence: z.string().trim().min(8).max(2000),
});

export const ResolveReportInput = z.object({
  reason: z.string().trim().min(4).max(500),
});

export const AppealReportInput = z.object({
  message: z.string().trim().min(8).max(2000),
});

export const ReportSummary = z.object({
  id: z.string(),
  gameId: z.string(),
  gameSlug: z.string(),
  gameTitle: z.string(),
  category: ReportCategory,
  evidence: z.string(),
  status: ReportStatus,
  moderationState: z.enum(['CLEAR', 'FLAGGED', 'QUARANTINED']),
  moderationReason: z.string(),
  appealMessage: z.string(),
  resolutionReason: z.string(),
  createdAt: z.string().datetime(),
});

export type ReportCategory = z.infer<typeof ReportCategory>;
export type ReportStatus = z.infer<typeof ReportStatus>;
export type CreateReportInput = z.infer<typeof CreateReportInput>;
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;
export type AppealReportInput = z.infer<typeof AppealReportInput>;
export type ReportSummary = z.infer<typeof ReportSummary>;
