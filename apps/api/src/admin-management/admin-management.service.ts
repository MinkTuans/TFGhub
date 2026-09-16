import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { database } from '@indieforge/database';
import type {
  AdminUsersQuery,
  AdminUserCreateInput,
  AdminUserUpdateInput,
  AdminUserDeleteInput,
  AdminGamesQuery,
  AdminGameUpdateInput,
  AdminGameDeleteInput,
  AdminManagedUser,
  AdminManagedGame,
  AdminManagedUserList,
  AdminManagedGameList,
} from '@indieforge/contracts';
import { PasswordHasher } from '../auth/auth.service.js';

export const ADMIN_MANAGEMENT_DATABASE = Symbol('ADMIN_MANAGEMENT_DATABASE');
type Client = typeof database;
type Transaction = Omit<
  Client,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
const userSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  adminVersion: true,
  createdAt: true,
  profile: { select: { displayName: true } },
  _count: {
    select: {
      games: true,
      projectRevisions: true,
      gameBuilds: true,
      submittedReleases: true,
      reviewedReleases: true,
    },
  },
} as const;
const gameSelect = {
  id: true,
  ownerId: true,
  slug: true,
  title: true,
  description: true,
  visibility: true,
  moderationState: true,
  accessMode: true,
  sourceType: true,
  reviewState: true,
  artifactReady: true,
  artifactVersion: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: { email: true, profile: { select: { displayName: true } } },
  },
  _count: { select: { builds: true, releases: true } },
} as const;
type UserRow = Pick<
  Awaited<ReturnType<Client['user']['findUniqueOrThrow']>>,
  'id' | 'email' | 'role' | 'isActive' | 'adminVersion' | 'createdAt'
> & {
  profile: { displayName: string } | null;
  _count: {
    games: number;
    projectRevisions: number;
    gameBuilds: number;
    submittedReleases: number;
    reviewedReleases: number;
  };
};
type GameRow = Pick<
  Awaited<ReturnType<Client['game']['findUniqueOrThrow']>>,
  | 'id'
  | 'ownerId'
  | 'slug'
  | 'title'
  | 'description'
  | 'visibility'
  | 'moderationState'
  | 'accessMode'
  | 'sourceType'
  | 'reviewState'
  | 'artifactReady'
  | 'artifactVersion'
  | 'submittedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  owner: { email: string; profile: { displayName: string } | null };
  _count: { builds: number; releases: number };
};
function userResponse(row: UserRow): AdminManagedUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    version: row.adminVersion,
    createdAt: row.createdAt.toISOString(),
    displayName: row.profile?.displayName ?? null,
    gameCount: row._count.games,
  };
}
function gameResponse(row: GameRow): AdminManagedGame {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerEmail: row.owner.email,
    ownerName: row.owner.profile?.displayName ?? null,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    moderationState: row.moderationState,
    accessMode: row.accessMode,
    sourceType: row.sourceType,
    reviewState: row.reviewState,
    artifactReady: row.artifactReady,
    artifactVersion: row.artifactVersion,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    buildCount: row._count.builds,
    releaseCount: row._count.releases,
  };
}
function conflict(): never {
  throw new ConflictException('Dữ liệu đã thay đổi. Vui lòng tải lại.');
}
function changed(count: number) {
  if (count !== 1) conflict();
}

@Injectable()
export class AdminManagementService {
  constructor(
    @Inject(ADMIN_MANAGEMENT_DATABASE) private readonly client: Client,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  private readUser(client: Transaction, id: string): Promise<UserRow | null> {
    return client.user.findUnique({ where: { id }, select: userSelect });
  }
  private readGame(client: Transaction, id: string): Promise<GameRow | null> {
    return client.game.findUnique({ where: { id }, select: gameSelect });
  }

  private async transaction<T>(
    actorId: string,
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(async (tx) => {
        // Serialize administrator mutations, including active-admin count checks.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(741923, 1)`;
        const actor = await tx.user.findUnique({
          where: { id: actorId },
          select: { role: true, isActive: true },
        });
        if (!actor?.isActive || actor.role !== 'ADMIN')
          throw new ForbiddenException(
            'Chỉ quản trị viên đang hoạt động được thực hiện thao tác này.',
          );
        return operation(tx);
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (code === 'P2002')
        throw new ConflictException('Email đã được sử dụng.');
      if (['P2003', 'P2025', 'P2034', 'P2014'].includes(code))
        throw new ConflictException(
          'Dữ liệu đã thay đổi hoặc có lịch sử liên quan. Hãy tải lại; có thể ẩn hoặc cách ly game thay vì xóa.',
        );
      throw error;
    }
  }

  async users(input: AdminUsersQuery): Promise<AdminManagedUserList> {
    const where = {
      role: input.role,
      isActive:
        input.active === undefined ? undefined : input.active === 'true',
      ...(input.query
        ? {
            OR: [
              {
                email: { contains: input.query, mode: 'insensitive' as const },
              },
              {
                profile: {
                  is: {
                    displayName: {
                      contains: input.query,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.client.$transaction([
      this.client.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: input.offset,
        take: input.limit,
      }),
      this.client.user.count({ where }),
    ]);
    return { items: rows.map(userResponse), total };
  }
  async user(id: string): Promise<AdminManagedUser> {
    const row = await this.readUser(this.client, id);
    if (!row) throw new NotFoundException('Không tìm thấy người dùng.');
    return userResponse(row);
  }
  async createUser(
    actorId: string,
    input: AdminUserCreateInput,
  ): Promise<AdminManagedUser> {
    const passwordHash = await this.hasher.hash(input.password);
    return this.transaction(actorId, async (tx) =>
      userResponse(
        await tx.user.create({
          data: {
            email: input.email.trim().toLowerCase(),
            passwordHash,
            role: input.role,
            isActive: input.isActive,
            ...(input.displayName !== undefined
              ? { profile: { create: { displayName: input.displayName } } }
              : {}),
          },
          select: userSelect,
        }),
      ),
    );
  }
  private async targetUser(
    tx: Transaction,
    id: string,
    version: number,
  ): Promise<UserRow> {
    // FOR UPDATE also blocks concurrent FK inserts (including game ownership).
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const row = await this.readUser(tx, id);
    if (!row) throw new NotFoundException('Không tìm thấy người dùng.');
    if (row.adminVersion !== version) conflict();
    return row;
  }
  private async protectAdmin(
    tx: Transaction,
    actorId: string,
    row: UserRow,
    removingAdmin: boolean,
  ) {
    if (!removingAdmin) return;
    if (actorId === row.id)
      throw new ConflictException(
        'Không thể hạ quyền, khóa hoặc xóa tài khoản đang đăng nhập.',
      );
    if (
      row.role === 'ADMIN' &&
      row.isActive &&
      (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) <= 1
    )
      throw new ConflictException(
        'Phải giữ ít nhất một quản trị viên đang hoạt động.',
      );
  }
  async updateUser(
    actorId: string,
    id: string,
    input: AdminUserUpdateInput,
  ): Promise<AdminManagedUser> {
    const passwordHash =
      input.password === undefined
        ? undefined
        : await this.hasher.hash(input.password);
    return this.transaction(actorId, async (tx) => {
      const row = await this.targetUser(tx, id, input.version);
      await this.protectAdmin(
        tx,
        actorId,
        row,
        input.isActive === false ||
          (input.role !== undefined && input.role !== 'ADMIN'),
      );
      changed(
        (
          await tx.user.updateMany({
            where: { id, adminVersion: input.version },
            data: {
              email: input.email?.trim().toLowerCase(),
              role: input.role,
              isActive: input.isActive,
              passwordHash,
              adminVersion: { increment: 1 },
            },
          })
        ).count,
      );
      if (input.displayName !== undefined)
        await tx.developerProfile.upsert({
          where: { userId: id },
          create: { userId: id, displayName: input.displayName },
          update: { displayName: input.displayName },
        });
      return userResponse((await this.readUser(tx, id))!);
    });
  }
  async deleteUser(
    actorId: string,
    id: string,
    input: AdminUserDeleteInput,
  ): Promise<void> {
    return this.transaction(actorId, async (tx) => {
      const row = await this.targetUser(tx, id, input.version);
      await this.protectAdmin(tx, actorId, row, true);
      if (Object.values(row._count).some((count) => count > 0))
        throw new ConflictException(
          'Người dùng có game hoặc lịch sử tác giả, bản dựng, phát hành. Hãy khóa tài khoản thay vì xóa.',
        );
      changed(
        (
          await tx.user.deleteMany({
            where: { id, adminVersion: input.version },
          })
        ).count,
      );
    });
  }
  async games(input: AdminGamesQuery): Promise<AdminManagedGameList> {
    const where = {
      ownerId: input.ownerId,
      visibility: input.visibility,
      moderationState: input.moderationState,
      reviewState: input.reviewState,
      ...(input.query
        ? {
            OR: [
              {
                title: { contains: input.query, mode: 'insensitive' as const },
              },
              { slug: { contains: input.query, mode: 'insensitive' as const } },
              {
                owner: {
                  email: {
                    contains: input.query,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.client.$transaction([
      this.client.game.findMany({
        where,
        select: gameSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: input.offset,
        take: input.limit,
      }),
      this.client.game.count({ where }),
    ]);
    return { items: rows.map(gameResponse), total };
  }
  async game(id: string): Promise<AdminManagedGame> {
    const row = await this.readGame(this.client, id);
    if (!row) throw new NotFoundException('Không tìm thấy game.');
    return gameResponse(row);
  }
  private async targetGame(
    tx: Transaction,
    id: string,
    updatedAt: string,
  ): Promise<GameRow> {
    await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${id} FOR UPDATE`;
    const row = await this.readGame(tx, id);
    if (!row) throw new NotFoundException('Không tìm thấy game.');
    if (row.updatedAt.getTime() !== new Date(updatedAt).getTime()) conflict();
    return row;
  }
  async updateGame(
    actorId: string,
    id: string,
    input: AdminGameUpdateInput,
  ): Promise<AdminManagedGame> {
    return this.transaction(actorId, async (tx) => {
      const row = await this.targetGame(tx, id, input.updatedAt);
      const metadataChanged = (
        ['title', 'description', 'accessMode'] as const
      ).some((key) => input[key] !== undefined && input[key] !== row[key]);
      const reset =
        metadataChanged &&
        (row.reviewState === 'APPROVED' || row.reviewState === 'PENDING');
      const hide =
        input.moderationState === 'FLAGGED' ||
        input.moderationState === 'QUARANTINED';
      if (
        input.visibility === 'PUBLIC' &&
        !reset &&
        !hide &&
        (row.reviewState !== 'APPROVED' ||
          !row.artifactReady ||
          row.artifactVersion < 1 ||
          (input.moderationState ?? row.moderationState) !== 'CLEAR')
      )
        throw new ConflictException(
          'Chỉ game đã duyệt, có bản dựng sẵn sàng và không bị gắn cờ mới được công khai.',
        );
      changed(
        (
          await tx.game.updateMany({
            where: { id, updatedAt: row.updatedAt },
            data: {
              title: input.title,
              description: input.description,
              accessMode: input.accessMode,
              visibility: hide ? 'DRAFT' : input.visibility,
              moderationState: input.moderationState,
              ...(reset
                ? {
                    visibility: 'DRAFT',
                    reviewState: 'DRAFT',
                    reviewNote: null,
                    submittedAt: null,
                    reviewedAt: null,
                  }
                : {}),
              updatedAt: new Date(
                Math.max(Date.now(), row.updatedAt.getTime() + 1),
              ),
            },
          })
        ).count,
      );
      return gameResponse((await this.readGame(tx, id))!);
    });
  }
  async deleteGame(
    actorId: string,
    id: string,
    input: AdminGameDeleteInput,
  ): Promise<void> {
    return this.transaction(actorId, async (tx) => {
      const row = await this.targetGame(tx, id, input.updatedAt);
      if (row._count.builds || row._count.releases)
        throw new ConflictException(
          'Game có lịch sử bản dựng hoặc phát hành. Hãy ẩn hoặc cách ly thay vì xóa.',
        );
      changed(
        (await tx.game.deleteMany({ where: { id, updatedAt: row.updatedAt } }))
          .count,
      );
    });
  }
}
