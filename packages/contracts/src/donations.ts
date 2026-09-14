import { z } from 'zod';

export const DonationStatus = z.enum(['PENDING', 'SUCCEEDED', 'FAILED']);

export const CreateDonationInput = z.object({
  amountCents: z.number().int().min(100).max(100_000),
  idempotencyKey: z.string().trim().min(8).max(64),
});

export const SandboxDonationWebhookInput = z.object({
  donationId: z.string().min(1).max(64),
  eventId: z.string().min(1).max(64),
  status: z.enum(['succeeded', 'failed']),
});

export const DonationSummary = z.object({
  id: z.string(),
  gameId: z.string(),
  gameSlug: z.string(),
  amountCents: z.number().int(),
  feeCents: z.number().int(),
  netCents: z.number().int(),
  currency: z.literal('USD'),
  status: DonationStatus,
  createdAt: z.string().datetime(),
});

export type CreateDonationInput = z.infer<typeof CreateDonationInput>;
export type SandboxDonationWebhookInput = z.infer<typeof SandboxDonationWebhookInput>;
export type DonationSummary = z.infer<typeof DonationSummary>;
export type DonationStatus = z.infer<typeof DonationStatus>;
