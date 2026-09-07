import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  PublicGamesRepository,
  type PublicGame,
  type PublicGamesQuery,
} from '../src/games/public-games.service.js';

type CatalogGame = PublicGame & {
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  reviewState: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  owner: PublicGame['owner'] & { email: string };
};

describe('Public game discovery HTTP boundary', () => {
  let app: INestApplication;
  let catalog: CatalogGame[];

  beforeEach(async () => {
    catalog = [];
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PublicGamesRepository)
      .useValue({
        async findMany(query: PublicGamesQuery) {
          const search = query.where.OR?.[0].title.contains.toLowerCase();
          const ordered = catalog
            .filter(
              (game) =>
                game.visibility === query.where.visibility &&
                game.moderationState === query.where.moderationState &&
                (!query.where.reviewState ||
                  game.reviewState === query.where.reviewState) &&
                (!search ||
                  game.title.toLowerCase().includes(search) ||
                  game.description.toLowerCase().includes(search)),
            )
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id),
            );
          const start = query.cursor
            ? ordered.findIndex((game) => game.id === query.cursor!.id) +
              (query.skip ?? 0)
            : 0;
          return ordered.slice(start, start + query.take);
        },
        async findBySlug({
          where,
        }: {
          where: {
            slug: string;
            visibility: 'PUBLIC';
            moderationState: 'CLEAR';
            reviewState?: 'APPROVED';
          };
        }) {
          return (
            catalog.find(
              (game) =>
                game.slug === where.slug &&
                game.visibility === where.visibility &&
                game.moderationState === where.moderationState &&
                (!where.reviewState || game.reviewState === where.reviewState),
            ) ?? null
          );
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function addGame(
    game: Partial<CatalogGame> & Pick<CatalogGame, 'id' | 'slug'>,
  ) {
    catalog.push({
      id: game.id,
      slug: game.slug,
      title: 'Demo game',
      description: 'A public game',
      visibility: 'PUBLIC',
      moderationState: 'CLEAR',
      reviewState: 'APPROVED',
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      owner: {
        email: 'owner@example.com',
        profile: { displayName: 'Demo developer' },
      },
      ...game,
    });
  }

  it('returns an empty public catalog', async () => {
    await request(app.getHttpServer())
      .get('/discover')
      .expect(200, { games: [], nextCursor: null });
  });

  it('preserves search filtering and id ordering across cursor continuations', async () => {
    addGame({
      id: 'game-3',
      slug: 'space-three',
      title: 'Space Three',
      createdAt: new Date('2026-09-05T12:03:00.000Z'),
    });
    addGame({
      id: 'game-2-a',
      slug: 'space-tie-a',
      title: 'Space Tie A',
      createdAt: new Date('2026-09-05T12:02:00.000Z'),
    });
    addGame({
      id: 'game-2-b',
      slug: 'space-tie-b',
      title: 'Space Tie B',
      createdAt: new Date('2026-09-05T12:02:00.000Z'),
    });
    addGame({
      id: 'game-2-c',
      slug: 'space-tie-c',
      title: 'Space Tie C',
      createdAt: new Date('2026-09-05T12:02:00.000Z'),
    });
    addGame({
      id: 'game-1',
      slug: 'space-one',
      description: 'Explore SPACE',
      createdAt: new Date('2026-09-05T12:01:00.000Z'),
    });
    addGame({
      id: 'game-unrelated',
      slug: 'unrelated-public-game',
      title: 'Puzzle game',
      description: 'No matching terms',
      createdAt: new Date('2026-09-05T12:01:30.000Z'),
    });

    const first = await request(app.getHttpServer())
      .get('/discover?query=space&limit=2')
      .expect(200);
    expect(first.body).toEqual({
      games: [
        {
          slug: 'space-three',
          title: 'Space Three',
          description: 'A public game',
          developer: { displayName: 'Demo developer' },
          createdAt: '2026-09-05T12:03:00.000Z',
        },
        {
          slug: 'space-tie-c',
          title: 'Space Tie C',
          description: 'A public game',
          developer: { displayName: 'Demo developer' },
          createdAt: '2026-09-05T12:02:00.000Z',
        },
      ],
      nextCursor: expect.any(String),
    });

    const second = await request(app.getHttpServer())
      .get(
        `/discover?query=space&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .expect(200);
    expect(second.body).toEqual({
      games: [
        {
          slug: 'space-tie-b',
          title: 'Space Tie B',
          description: 'A public game',
          developer: { displayName: 'Demo developer' },
          createdAt: '2026-09-05T12:02:00.000Z',
        },
        {
          slug: 'space-tie-a',
          title: 'Space Tie A',
          description: 'A public game',
          developer: { displayName: 'Demo developer' },
          createdAt: '2026-09-05T12:02:00.000Z',
        },
      ],
      nextCursor: expect.any(String),
    });

    const third = await request(app.getHttpServer())
      .get(
        `/discover?query=space&limit=2&cursor=${encodeURIComponent(second.body.nextCursor)}`,
      )
      .expect(200, {
        games: [
          {
            slug: 'space-one',
            title: 'Demo game',
            description: 'Explore SPACE',
            developer: { displayName: 'Demo developer' },
            createdAt: '2026-09-05T12:01:00.000Z',
          },
        ],
        nextCursor: null,
      });

    const slugs = [
      ...first.body.games,
      ...second.body.games,
      ...third.body.games,
    ].map((game: { slug: string }) => game.slug);
    expect(slugs).toEqual([
      'space-three',
      'space-tie-c',
      'space-tie-b',
      'space-tie-a',
      'space-one',
    ]);
    expect(new Set(slugs)).toHaveLength(slugs.length);
  });

  it('does not expose drafts by slug', async () => {
    addGame({ id: 'game-1', slug: 'draft-game', visibility: 'DRAFT' });

    await request(app.getHttpServer())
      .get('/games/by-slug/draft-game')
      .expect(404);
  });

  it('excludes unapproved public rows from discovery and slug reads', async () => {
    addGame({ id: 'game-1', slug: 'unapproved', reviewState: 'DRAFT' });
    await request(app.getHttpServer())
      .get('/discover')
      .expect(200, { games: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/games/by-slug/unapproved')
      .expect(404);
  });

  it('returns exactly the public response fields without the owner email', async () => {
    addGame({ id: 'game-1', slug: 'public-game' });

    const response = await request(app.getHttpServer())
      .get('/games/by-slug/public-game')
      .expect(200);
    expect(response.body).toEqual({
      slug: 'public-game',
      title: 'Demo game',
      description: 'A public game',
      developer: { displayName: 'Demo developer' },
      createdAt: '2026-09-05T12:00:00.000Z',
    });
    expect(response.body.email).toBeUndefined();
    expect(response.body.developer.email).toBeUndefined();
  });
});
