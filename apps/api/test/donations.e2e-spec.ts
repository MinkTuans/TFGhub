import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AuthUsersRepository,
  type StoredUser,
} from '../src/auth/auth.service.js';
import {
  DonationsRepository,
  type PublicDonateGame,
  type StoredDonation,
} from '../src/donations/donations.service.js';

const testSecret = 'donations-e2e-tests-only-a-long-explicit-signing-secret';
const createdAt = new Date('2026-09-05T12:00:00.000Z');

describe('Sandbox donation HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  let donations: Map<string, StoredDonation>;
  const game: PublicDonateGame = {
    id: 'game-1',
    slug: 'orbit-orchard',
    ownerId: 'user-1',
    visibility: 'PUBLIC',
    moderationState: 'CLEAR',
  };

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    vi.stubEnv('SANDBOX_DONATION_WEBHOOK_SECRET', 'sandbox-test-secret');
    users = new Map();
    donations = new Map();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        async create(input: { email: string; passwordHash: string }) {
          const id = `user-${users.size + 1}`;
          const user: StoredUser = { ...input, id, role: 'USER' };
          users.set(id, user);
          return user;
        },
        async findByEmail(email: string) {
          return [...users.values()].find((user) => user.email === email) ?? null;
        },
        async findById(id: string) {
          return users.get(id) ?? null;
        },
      })
      .overrideProvider(DonationsRepository)
      .useValue({
        async findPublicGame(slug: string) {
          return slug === game.slug ? game : null;
        },
        async findByIdempotency(donorId: string, key: string) {
          return (
            [...donations.values()].find(
              (row) => row.donorId === donorId && row.idempotencyKey === key,
            ) ?? null
          );
        },
        async findById(id: string) {
          return donations.get(id) ?? null;
        },
        async findByProviderEventId(eventId: string) {
          return (
            [...donations.values()].find((row) => row.providerEventId === eventId) ??
            null
          );
        },
        async create(input: Omit<StoredDonation, 'id' | 'status' | 'providerEventId' | 'createdAt' | 'currency'>) {
          const stored: StoredDonation = {
            id: `don-${donations.size + 1}`,
            currency: 'USD',
            status: 'PENDING',
            providerEventId: null,
            createdAt,
            ...input,
          };
          donations.set(stored.id, stored);
          return stored;
        },
        async save(donation: StoredDonation) {
          donations.set(donation.id, { ...donation });
          return donations.get(donation.id)!;
        },
        async listReceived(recipientId: string) {
          return [...donations.values()].filter(
            (row) => row.recipientId === recipientId && row.status === 'SUCCEEDED',
          );
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.unstubAllEnvs();
  });

  it('completes a sandbox donation once and lists it for the creator', async () => {
    const owner = request.agent(app.getHttpServer());
    await owner
      .post('/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);
    const donor = request.agent(app.getHttpServer());
    await donor
      .post('/auth/register')
      .send({ email: 'donor@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/games/orbit-orchard/donations')
      .send({ amountCents: 500, idempotencyKey: 'donate-key-1' })
      .expect(401);

    const created = await donor
      .post('/games/orbit-orchard/donations')
      .send({ amountCents: 500, idempotencyKey: 'donate-key-1' })
      .expect(201);
    expect(created.body).toMatchObject({
      amountCents: 500,
      feeCents: 50,
      netCents: 450,
      status: 'PENDING',
    });

    const paid = await donor
      .post(`/donations/${created.body.id}/sandbox-pay`)
      .expect(200);
    expect(paid.body.status).toBe('SUCCEEDED');

    const webhook = await request(app.getHttpServer())
      .post('/donations/webhooks/sandbox')
      .set('x-sandbox-secret', 'sandbox-test-secret')
      .send({
        donationId: created.body.id,
        eventId: `sandbox-${created.body.id}`,
        status: 'succeeded',
      })
      .expect(200);
    expect(webhook.body.status).toBe('SUCCEEDED');

    const received = await owner.get('/donations/received').expect(200);
    expect(received.body).toHaveLength(1);
    expect(received.body[0].netCents).toBe(450);
  });
});
