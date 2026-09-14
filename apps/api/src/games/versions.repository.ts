import type { GameSummary } from '@indieforge/contracts';

export type StoredVersion = {
  id: string;
  gameId: string;
  status: 'UPLOADING' | 'SCANNING' | 'READY' | 'REJECTED';
  filename: string;
  byteSize: number;
  checksumSha256: string;
  storageKey: string;
  findings: string;
  uploadToken: string | null;
  uploadExpiresAt: Date | null;
  createdAt: Date;
};

export type OwnedGame = {
  id: string;
  ownerId: string;
  visibility: 'DRAFT' | 'PUBLIC' | 'UNLISTED';
  moderationState: 'CLEAR' | 'FLAGGED' | 'QUARANTINED';
  activeVersionId: string | null;
};

export abstract class VersionsRepository {
  abstract create(input: {
    gameId: string;
    filename: string;
    byteSize: number;
    checksumSha256: string;
    storageKey: string;
    uploadToken: string;
    uploadExpiresAt: Date;
  }): Promise<StoredVersion>;
  abstract findById(id: string): Promise<StoredVersion | null>;
  abstract findByUploadToken(token: string): Promise<StoredVersion | null>;
  abstract save(version: StoredVersion): Promise<StoredVersion>;
  abstract findGame(id: string): Promise<OwnedGame | null>;
  abstract publish(gameId: string, versionId: string): Promise<GameSummary>;
  abstract findPublishedRuntime(
    slug: string,
  ): Promise<{ storageKey: string } | null>;
  abstract listByGame(gameId: string): Promise<StoredVersion[]>;
}
