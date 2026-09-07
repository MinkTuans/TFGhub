import { BadRequestException, Inject, Injectable } from '@nestjs/common';

export type PublicGame = {
  id: string;
  slug: string;
  title: string;
  description: string;
  createdAt: Date;
  owner: { profile: { displayName: string } | null };
};

type PublicGameWhere = {
  visibility: 'PUBLIC';
  moderationState: 'CLEAR';
  reviewState: 'APPROVED';
  OR?: [
    { title: { contains: string; mode: 'insensitive' } },
    { description: { contains: string; mode: 'insensitive' } },
  ];
};

export type PublicGamesQuery = {
  where: PublicGameWhere;
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
  take: number;
  cursor?: { id: string };
  skip?: 1;
};

export type PublicGameSlugQuery = { where: PublicGameWhere & { slug: string } };

export abstract class PublicGamesRepository {
  abstract findMany(query: PublicGamesQuery): Promise<PublicGame[]>;
  abstract findBySlug(query: PublicGameSlugQuery): Promise<PublicGame | null>;
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

function decodeCursor(cursor: string): string {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('id' in decoded) ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0
    ) {
      throw new Error('Invalid cursor');
    }
    return decoded.id;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

function summary(game: PublicGame) {
  return {
    slug: game.slug,
    title: game.title,
    description: game.description,
    developer: {
      displayName: game.owner.profile?.displayName ?? 'Unknown developer',
    },
    createdAt: game.createdAt.toISOString(),
  };
}

@Injectable()
export class PublicGamesService {
  constructor(
    @Inject(PublicGamesRepository)
    private readonly games: PublicGamesRepository,
  ) {}

  async discover({
    query,
    cursor,
    limit = 20,
  }: { query?: string; cursor?: string; limit?: number } = {}) {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const search = query?.trim();
    const where: PublicGameWhere = {
      visibility: 'PUBLIC',
      moderationState: 'CLEAR',
      reviewState: 'APPROVED',
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              {
                description: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const games = await this.games.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      ...(cursor
        ? { cursor: { id: decodeCursor(cursor) }, skip: 1 as const }
        : {}),
    });
    const page = games.slice(0, pageSize);
    return {
      games: page.map(summary),
      nextCursor:
        games.length > pageSize
          ? encodeCursor(page[page.length - 1]!.id)
          : null,
    };
  }

  async findBySlug(slug: string) {
    const game = await this.games.findBySlug({
      where: {
        slug,
        visibility: 'PUBLIC',
        moderationState: 'CLEAR',
        reviewState: 'APPROVED',
      },
    });
    return game ? summary(game) : null;
  }
}
