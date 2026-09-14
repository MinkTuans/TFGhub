import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CreateDonationInput, DonationSummary } from '@indieforge/contracts';

export type StoredDonation = {
  id: string;
  gameId: string;
  gameSlug: string;
  donorId: string;
  recipientId: string;
  amountCents: number;
  feeCents: number;
  currency: 'USD';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  idempotencyKey: string;
  providerEventId: string | null;
  createdAt: Date;
};

export type PublicDonateGame = {
  id: string;
  slug: string;
  ownerId: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
};

export abstract class DonationsRepository {
  abstract findPublicGame(slug: string): Promise<PublicDonateGame | null>;
  abstract findByIdempotency(
    donorId: string,
    idempotencyKey: string,
  ): Promise<StoredDonation | null>;
  abstract findById(id: string): Promise<StoredDonation | null>;
  abstract findByProviderEventId(eventId: string): Promise<StoredDonation | null>;
  abstract create(input: {
    gameId: string;
    gameSlug: string;
    donorId: string;
    recipientId: string;
    amountCents: number;
    feeCents: number;
    idempotencyKey: string;
  }): Promise<StoredDonation>;
  abstract save(donation: StoredDonation): Promise<StoredDonation>;
  abstract listReceived(recipientId: string): Promise<StoredDonation[]>;
}

function summary(donation: StoredDonation): DonationSummary {
  return {
    id: donation.id,
    gameId: donation.gameId,
    gameSlug: donation.gameSlug,
    amountCents: donation.amountCents,
    feeCents: donation.feeCents,
    netCents: donation.amountCents - donation.feeCents,
    currency: 'USD',
    status: donation.status,
    createdAt: donation.createdAt.toISOString(),
  };
}

export function donationFeeCents(
  amountCents: number,
  feeBps = Number(process.env.DONATION_FEE_BPS ?? 1000),
): number {
  const bps = Number.isFinite(feeBps) ? Math.min(Math.max(feeBps, 0), 5000) : 1000;
  return Math.floor((amountCents * bps) / 10_000);
}

@Injectable()
export class DonationsService {
  constructor(
    @Inject(DonationsRepository)
    private readonly donations: DonationsRepository,
  ) {}

  async create(
    slug: string,
    donorId: string,
    input: CreateDonationInput,
  ): Promise<DonationSummary> {
    const game = await this.donations.findPublicGame(slug);
    if (
      !game ||
      game.visibility !== 'PUBLIC' ||
      game.moderationState !== 'CLEAR'
    ) {
      throw new NotFoundException('Game not found');
    }
    if (game.ownerId === donorId) {
      throw new ForbiddenException('You cannot donate to your own game');
    }
    const existing = await this.donations.findByIdempotency(
      donorId,
      input.idempotencyKey,
    );
    if (existing) return summary(existing);
    const feeCents = donationFeeCents(input.amountCents);
    return summary(
      await this.donations.create({
        gameId: game.id,
        gameSlug: game.slug,
        donorId,
        recipientId: game.ownerId,
        amountCents: input.amountCents,
        feeCents,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }

  async applyWebhook(event: {
    donationId: string;
    eventId: string;
    status: 'succeeded' | 'failed';
  }): Promise<DonationSummary> {
    const byEvent = await this.donations.findByProviderEventId(event.eventId);
    if (byEvent) return summary(byEvent);
    const donation = await this.donations.findById(event.donationId);
    if (!donation) throw new NotFoundException('Donation not found');
    if (donation.status !== 'PENDING') return summary(donation);
    donation.status = event.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
    donation.providerEventId = event.eventId;
    return summary(await this.donations.save(donation));
  }

  async sandboxPay(donationId: string, donorId: string): Promise<DonationSummary> {
    const donation = await this.donations.findById(donationId);
    if (!donation) throw new NotFoundException('Donation not found');
    if (donation.donorId !== donorId) {
      throw new UnauthorizedException();
    }
    return this.applyWebhook({
      donationId,
      eventId: `sandbox-${donationId}`,
      status: 'succeeded',
    });
  }

  async listReceived(recipientId: string): Promise<DonationSummary[]> {
    return (await this.donations.listReceived(recipientId)).map(summary);
  }
}
