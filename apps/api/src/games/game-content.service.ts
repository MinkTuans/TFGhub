import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EngineBuildService } from './engine-build.service.js';
import { GameProjectInput } from '@indieforge/contracts';
import { JwtService } from '@nestjs/jwt';
import { extname } from 'node:path';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import {
  ArtifactStorage,
  ArtifactVersionExistsError,
} from '../game-artifacts/artifact-storage.js';
import type { ArtifactFile } from '../game-artifacts/artifact-types.js';
import { compileCode } from '../game-artifacts/code-compiler.js';
import { compileStory } from '../game-artifacts/story-compiler.js';
import { compilePlatformer } from '../game-artifacts/platformer-compiler.js';
import {
  GamesRepository,
  gameSummary,
  type StoredGame,
  type WorkspaceUpdate,
} from './games.service.js';

const fixedUploadBytes = 25 * 1024 * 1024;

export function uploadLimitFromEnvironment(value: string | undefined): number {
  if (value !== undefined && value !== String(fixedUploadBytes)) {
    throw new Error(`GAME_UPLOAD_MAX_BYTES must be ${fixedUploadBytes}`);
  }
  return fixedUploadBytes;
}

export const MAX_UPLOAD_BYTES = uploadLimitFromEnvironment(
  process.env.GAME_UPLOAD_MAX_BYTES,
);
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 1000;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 1024 &&
    !/[\\:]/.test(path) &&
    !Array.from(path).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) &&
    path
      .split('/')
      .every(
        (part) =>
          part !== '' &&
          part !== '.' &&
          part !== '..' &&
          part !== '.indieforge-artifact.json',
      )
  );
}

const resetReview = {
  visibility: 'DRAFT',
  reviewState: 'DRAFT',
  reviewNote: null,
  submittedAt: null,
  reviewedAt: null,
} as const;

type Viewer = { id: string; role: 'USER' | 'MODERATOR' | 'ADMIN' };

async function readZip(buffer: Buffer): Promise<ArtifactFile[]> {
  if (buffer.length > MAX_UPLOAD_BYTES)
    throw new BadRequestException('ZIP exceeds 25 MiB');
  try {
    const zip = await new Promise<ZipFile>((resolve, reject) => {
      fromBuffer(
        buffer,
        { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
        (error, value) => {
          if (error) reject(error);
          else resolve(value);
        },
      );
    });
    return await new Promise<ArtifactFile[]>((resolve, reject) => {
      const files: ArtifactFile[] = [];
      const names = new Set<string>();
      let count = 0;
      let bytes = 0;
      let failed = false;
      const fail = (error: unknown) => {
        if (failed) return;
        failed = true;
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('end', () => {
        if (failed) return;
        if (!files.some((file) => file.path === 'index.html'))
          return fail(new Error('ZIP requires a root index.html'));
        resolve(files);
      });
      zip.on('entry', (entry: Entry) => {
        void (async () => {
          if (++count > MAX_ENTRIES)
            throw new Error('ZIP exceeds 1,000 entries');
          const directory = entry.fileName.endsWith('/');
          const path = directory ? entry.fileName.slice(0, -1) : entry.fileName;
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (!validPath(path) || names.has(path))
            throw new Error('Unsafe or duplicate ZIP path');
          if (
            files.some((file) => path.startsWith(`${file.path}/`)) ||
            (!directory &&
              Array.from(names).some((name) => name.startsWith(`${path}/`)))
          ) {
            throw new Error('ZIP file and directory paths conflict');
          }
          if ((entry.generalPurposeBitFlag & 0x41) !== 0)
            throw new Error('Encrypted entries are not supported');
          if (mode !== 0 && mode !== (directory ? 0o040000 : 0o100000))
            throw new Error(
              'ZIP contains a symbolic link or unsupported file type',
            );
          names.add(path);
          if (directory) {
            if (entry.uncompressedSize !== 0)
              throw new Error('Directory entries must be empty');
          } else {
            const contentType = mimeTypes[extname(path).toLowerCase()];
            if (!contentType) throw new Error('Unsupported file extension');
            const stream = await new Promise<NodeJS.ReadableStream>(
              (resolveStream, rejectStream) => {
                zip.openReadStream(entry, (error, value) => {
                  if (error) rejectStream(error);
                  else resolveStream(value);
                });
              },
            );
            const chunks: Buffer[] = [];
            // Enforce the actual inflated byte total, never trust central-directory sizes.
            for await (const chunk of stream) {
              const data = Buffer.from(chunk as Uint8Array);
              bytes += data.length;
              if (bytes > MAX_EXPANDED_BYTES)
                throw new Error('ZIP exceeds 100 MiB expanded');
              chunks.push(data);
            }
            files.push({ path, contentType, content: Buffer.concat(chunks) });
          }
          if (!failed) zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid ZIP archive',
    );
  }
}

@Injectable()
export class GameContentService {
  private readonly mutations = new Map<string, Promise<void>>();

  constructor(
    @Inject(GamesRepository) private readonly games: GamesRepository,
    @Inject(ArtifactStorage) private readonly storage: ArtifactStorage,
    @Inject(JwtService) private readonly tokens: JwtService,
    @Inject(EngineBuildService) private readonly engine?: EngineBuildService,
  ) {}

  private async serialized<T>(
    gameId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutations.get(gameId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutations.set(gameId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.mutations.get(gameId) === current) this.mutations.delete(gameId);
    }
  }

  async owned(gameId: string, userId: string): Promise<StoredGame> {
    const game = await this.games.findUnique(gameId);
    if (!game || game.ownerId !== userId)
      throw new ForbiddenException('You do not own this game');
    return game;
  }

  async workspace(gameId: string, userId: string) {
    return gameSummary(await this.owned(gameId, userId));
  }

  async saveProject(gameId: string, userId: string, input: unknown) {
    return this.serialized(gameId, async () => {
      const game = await this.owned(gameId, userId);
      const project = this.project(game, input);
      return this.update(game, {
        ...resetReview,
        projectData: project,
        artifactReady: false,
      });
    });
  }

  private project(game: StoredGame, input: unknown): GameProjectInput {
    const parsed = GameProjectInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid game project');
    if (parsed.data.sourceType !== game.sourceType)
      throw new BadRequestException(
        'Project source type does not match the game',
      );
    return parsed.data;
  }

  async build(gameId: string, userId: string) {
    return this.serialized(gameId, async () => {
      const game = await this.owned(gameId, userId);
      if (game.sourceType === 'ENGINE') {
        if (!this.engine)
          throw new ServiceUnavailableException('Engine builder unavailable');
        const build = await this.engine.prepare(gameId, userId, game.updatedAt);
        try {
          const result = await this.install(game, build.files, {
            viewportWidth: build.viewport.width,
            viewportHeight: build.viewport.height,
            engineBuild: {
              id: build.buildId,
              revisionNumber: build.revisionNumber,
              contentHash: build.contentHash,
            },
          });
          return result;
        } catch (error) {
          await this.engine.fail(build.buildId);
          throw error;
        }
      }
      const project = this.project(game, game.projectData);
      const files =
        project.sourceType === 'CODE'
          ? compileCode(project)
          : project.sourceType === 'STORY'
            ? compileStory(project)
            : compilePlatformer(project);
      return this.install(game, files);
    });
  }

  async upload(gameId: string, userId: string, archive: Buffer) {
    return this.serialized(gameId, async () => {
      const game = await this.owned(gameId, userId);
      if (game.sourceType !== 'UPLOAD')
        throw new BadRequestException('This game does not accept ZIP uploads');
      return this.install(game, await readZip(archive));
    });
  }

  private async install(
    game: StoredGame,
    files: ArtifactFile[],
    dimensions: Pick<
      WorkspaceUpdate,
      'viewportWidth' | 'viewportHeight' | 'engineBuild'
    > = {},
  ) {
    const artifactVersion = game.artifactVersion + 1;
    try {
      await this.storage.install(game.id, artifactVersion, files);
    } catch (error) {
      if (!(error instanceof ArtifactVersionExistsError)) {
        throw new ServiceUnavailableException(
          'Artifact storage is unavailable',
        );
      }
      // A previous request may have lost its DB connection after installation.
      // Never delete the current version or any historical referenced version.
      const fresh = await this.reconciliationState(game.id);
      if (!fresh || fresh.artifactVersion >= artifactVersion) {
        throw new ConflictException('Game changed; reload the workspace');
      }
      await this.discard(game.id, artifactVersion, fresh.artifactVersion);
      if (fresh.updatedAt.getTime() !== game.updatedAt.getTime()) {
        throw new ConflictException('Game changed; reload the workspace');
      }
      try {
        await this.storage.install(game.id, artifactVersion, files);
      } catch {
        throw new ServiceUnavailableException(
          'Artifact storage is unavailable',
        );
      }
    }
    try {
      return await this.update(game, {
        ...resetReview,
        artifactVersion,
        artifactReady: true,
        ...dimensions,
      });
    } catch (error) {
      // A lost commit response can leave the original transaction in flight.
      // Wait on its row lock before deciding which bytes are unreferenced.
      const fresh = await this.reconciliationState(game.id);
      if (fresh?.artifactVersion === artifactVersion) return gameSummary(fresh);
      if (fresh && fresh.artifactVersion < artifactVersion) {
        await this.discard(game.id, artifactVersion, fresh.artifactVersion);
      }
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'Artifact finalization is unavailable',
      );
    }
  }

  private async reconciliationState(gameId: string) {
    try {
      return await this.games.lockForArtifactReconciliation(gameId);
    } catch {
      throw new ServiceUnavailableException(
        'Artifact finalization is unavailable',
      );
    }
  }

  private async discard(
    gameId: string,
    version: number,
    referencedVersion: number,
  ) {
    try {
      await this.storage.discardUnreferenced(
        gameId,
        version,
        referencedVersion,
      );
    } catch {
      throw new ServiceUnavailableException('Artifact storage is unavailable');
    }
  }

  private async update(game: StoredGame, input: WorkspaceUpdate) {
    const updated = await this.games.updateWorkspace(
      game.id,
      game.updatedAt,
      input,
    );
    if (!updated)
      throw new ConflictException('Game changed; reload the workspace');
    return gameSummary(updated);
  }

  private async previewGame(gameId: string, user: Viewer) {
    const game = await this.games.findUnique(gameId);
    if (
      !game ||
      (game.ownerId !== user.id &&
        user.role !== 'MODERATOR' &&
        user.role !== 'ADMIN')
    ) {
      throw new ForbiddenException('You cannot preview this game');
    }
    return game;
  }

  private isPublic(game: StoredGame): boolean {
    return (
      game.visibility === 'PUBLIC' &&
      game.reviewState === 'APPROVED' &&
      game.moderationState === 'CLEAR' &&
      game.artifactVersion > 0 &&
      game.artifactReady
    );
  }

  private async playGame(slug: string, user?: Viewer) {
    const game = await this.games.findBySlug(slug);
    if (!game || !this.isPublic(game)) {
      throw new NotFoundException('Game not found');
    }
    if (game.accessMode === 'AUTH_REQUIRED' && !user)
      throw new UnauthorizedException();
    return game;
  }

  async previewCapability(gameId: string, user: Viewer) {
    return this.mint(await this.previewGame(gameId, user), 'preview', true);
  }

  async playCapability(slug: string, user?: Viewer) {
    return this.mint(
      await this.playGame(slug, user),
      'play',
      user !== undefined,
    );
  }

  private async mint(
    game: StoredGame,
    purpose: 'preview' | 'play',
    authenticated: boolean,
  ) {
    if (game.artifactVersion < 1)
      throw new NotFoundException('Game file not found');
    const iat = Math.floor(Date.now() / 1000);
    const token = await this.tokens.signAsync(
      {
        gameId: game.id,
        artifactVersion: game.artifactVersion,
        purpose,
        authenticated,
        iat,
      },
      {
        algorithm: 'HS256',
        audience: 'game-content',
        issuer: 'indieforge-game-content',
        expiresIn: 300,
      },
    );
    return { token, expiresAt: new Date((iat + 300) * 1000).toISOString() };
  }

  async capabilityFile(token: string, path: string) {
    let payload: {
      gameId?: unknown;
      artifactVersion?: unknown;
      purpose?: unknown;
      authenticated?: unknown;
      exp?: unknown;
    };
    try {
      payload = await this.tokens.verifyAsync(token, {
        algorithms: ['HS256'],
        audience: 'game-content',
        issuer: 'indieforge-game-content',
      });
      if (
        typeof payload.gameId !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(payload.gameId) ||
        !Number.isSafeInteger(payload.artifactVersion) ||
        !['preview', 'play'].includes(String(payload.purpose)) ||
        typeof payload.authenticated !== 'boolean' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('Invalid capability');
      }
    } catch {
      throw new NotFoundException(
        'Game content capability is invalid or expired',
      );
    }
    const game = await this.games.findUnique(payload.gameId as string);
    if (
      !game ||
      game.artifactVersion !== payload.artifactVersion ||
      (payload.purpose === 'play' &&
        (!this.isPublic(game) ||
          (game.accessMode === 'AUTH_REQUIRED' && !payload.authenticated)))
    ) {
      throw new NotFoundException('Game file not found');
    }
    return this.file(game, path);
  }

  private async file(game: StoredGame, path: string) {
    if (!validPath(path) || game.artifactVersion < 1)
      throw new NotFoundException('Game file not found');
    try {
      return await this.storage.read(game.id, game.artifactVersion, path);
    } catch {
      throw new NotFoundException('Game file not found');
    }
  }
}
