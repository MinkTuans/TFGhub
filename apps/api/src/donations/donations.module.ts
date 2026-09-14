import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { DonationsController } from './donations.controller.js';
import {
  DonationsRepository,
  DonationsService,
  type StoredDonation,
} from './donations.service.js';

function mapDonation(row: {
  id: string;
  gameId: string;
  donorId: string;
  recipientId: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  idempotencyKey: string;
  providerEventId: string | null;
  createdAt: Date;
  game: { slug: string };
}): StoredDonation {
  return {
    ...row,
    currency: 'USD',
    gameSlug: row.game.slug,
  };
}

const donationInclude = { game: { select: { slug: true } } } as const;

@Module({
  imports: [AuthModule],
  controllers: [DonationsController],
  providers: [
    DonationsService,
    {
      provide: DonationsRepository,
      useFactory: (): DonationsRepository => ({
        findPublicGame: (slug) =>
          database.game.findFirst({
            where: { slug, visibility: 'PUBLIC', moderationState: 'CLEAR' },
            select: {
              id: true,
              slug: true,
              ownerId: true,
              visibility: true,
              moderationState: true,
            },
          }),
        findByIdempotency: async (donorId, idempotencyKey) => {
          const row = await database.donation.findUnique({
            where: { donorId_idempotencyKey: { donorId, idempotencyKey } },
            include: donationInclude,
          });
          return row ? mapDonation(row) : null;
        },
        findById: async (id) => {
          const row = await database.donation.findUnique({
            where: { id },
            include: donationInclude,
          });
          return row ? mapDonation(row) : null;
        },
        findByProviderEventId: async (providerEventId) => {
          const row = await database.donation.findUnique({
            where: { providerEventId },
            include: donationInclude,
          });
          return row ? mapDonation(row) : null;
        },
        create: async (input) => {
          const row = await database.donation.create({
            data: {
              gameId: input.gameId,
              donorId: input.donorId,
              recipientId: input.recipientId,
              amountCents: input.amountCents,
              feeCents: input.feeCents,
              idempotencyKey: input.idempotencyKey,
            },
            include: donationInclude,
          });
          return mapDonation(row);
        },
        save: async (donation) => {
          const row = await database.donation.update({
            where: { id: donation.id },
            data: {
              status: donation.status,
              providerEventId: donation.providerEventId,
            },
            include: donationInclude,
          });
          return mapDonation(row);
        },
        listReceived: async (recipientId) => {
          const rows = await database.donation.findMany({
            where: { recipientId, status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            include: donationInclude,
          });
          return rows.map(mapDonation);
        },
      }),
    },
  ],
})
export class DonationsModule {}
