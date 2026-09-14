import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DonationsService,
  donationFeeCents,
  type PublicDonateGame,
  type StoredDonation,
  type DonationsRepository,
} from './donations.service.js';

const createdAt = new Date('2026-09-05T12:00:00.000Z');

function makeRepo(
  game: PublicDonateGame,
  rows: Map<string, StoredDonation>,
): DonationsRepository {
  return {
    async findPublicGame(slug) {
      return slug === game.slug ? game : null;
    },
    async findByIdempotency(donorId, key) {
      return (
        [...rows.values()].find(
          (row) => row.donorId === donorId && row.idempotencyKey === key,
        ) ?? null
      );
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async findByProviderEventId(eventId) {
      return (
        [...rows.values()].find((row) => row.providerEventId === eventId) ?? null
      );
    },
    async create(input) {
      const stored: StoredDonation = {
        id: `don-${rows.size + 1}`,
        currency: 'USD',
        status: 'PENDING',
        providerEventId: null,
        createdAt,
        ...input,
      };
      rows.set(stored.id, stored);
      return stored;
    },
    async save(donation) {
      rows.set(donation.id, { ...donation });
      return rows.get(donation.id)!;
    },
    async listReceived(recipientId) {
      return [...rows.values()].filter(
        (row) => row.recipientId === recipientId && row.status === 'SUCCEEDED',
      );
    },
  };
}

describe('DonationsService', () => {
  const game: PublicDonateGame = {
    id: 'game-1',
    slug: 'orbit-orchard',
    ownerId: 'owner-1',
    visibility: 'PUBLIC',
    moderationState: 'CLEAR',
  };

  it('charges a disclosed 10% fee and completes a sandbox payment once', async () => {
    expect(donationFeeCents(500)).toBe(50);
    const rows = new Map<string, StoredDonation>();
    const service = new DonationsService(makeRepo(game, rows));
    const created = await service.create('orbit-orchard', 'donor-1', {
      amountCents: 500,
      idempotencyKey: 'donate-key-1',
    });
    expect(created.status).toBe('PENDING');
    expect(created.feeCents).toBe(50);
    expect(created.netCents).toBe(450);
    const paid = await service.sandboxPay(created.id, 'donor-1');
    expect(paid.status).toBe('SUCCEEDED');
    const again = await service.applyWebhook({
      donationId: created.id,
      eventId: `sandbox-${created.id}`,
      status: 'succeeded',
    });
    expect(again.status).toBe('SUCCEEDED');
    const received = await service.listReceived('owner-1');
    expect(received).toHaveLength(1);
    expect(received[0]?.netCents).toBe(450);
  });

  it('returns the same donation for a reused idempotency key', async () => {
    const rows = new Map<string, StoredDonation>();
    const service = new DonationsService(makeRepo(game, rows));
    const input = { amountCents: 200, idempotencyKey: 'same-key-99' };
    const first = await service.create('orbit-orchard', 'donor-1', input);
    const second = await service.create('orbit-orchard', 'donor-1', input);
    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it('rejects donations to your own game or a draft', async () => {
    const rows = new Map<string, StoredDonation>();
    const service = new DonationsService(makeRepo(game, rows));
    await expect(
      service.create('orbit-orchard', 'owner-1', {
        amountCents: 200,
        idempotencyKey: 'self-donate-1',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create('missing', 'donor-1', {
        amountCents: 200,
        idempotencyKey: 'missing-game-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
