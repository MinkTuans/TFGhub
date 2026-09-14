import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve, sep } from 'node:path';

export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer | null>;
  presignPut?(key: string, expiresSeconds: number): Promise<string | null>;
}

export type ObjectBucket = {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
};

export function assertSafeStorageKey(key: string): string {
  const relative = posix.normalize(key.replaceAll('\\', '/')).replace(/^\/+/, '');
  if (
    !relative ||
    relative === '.' ||
    relative.startsWith('../') ||
    relative.split('/').includes('..')
  ) {
    throw new Error('Invalid storage key');
  }
  return relative;
}

export class MemoryObjectStorage extends ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(assertSafeStorageKey(key), Buffer.from(body));
  }

  async get(key: string): Promise<Buffer | null> {
    const value = this.objects.get(assertSafeStorageKey(key));
    return value ? Buffer.from(value) : null;
  }

  async presignPut(_key: string, _expiresSeconds: number): Promise<string | null> {
    return null;
  }
}

export class LocalObjectStorage extends ObjectStorage {
  constructor(private readonly root: string) {
    super();
  }

  private resolveKey(key: string): string {
    const relative = assertSafeStorageKey(key);
    const dest = resolve(this.root, relative);
    const root = resolve(this.root) + sep;
    if (dest !== resolve(this.root) && !dest.startsWith(root)) {
      throw new Error('Invalid storage key');
    }
    return dest;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const dest = this.resolveKey(key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch {
      return null;
    }
  }
}

export class R2ObjectStorage extends ObjectStorage {
  constructor(
    private readonly bucket: ObjectBucket,
    private readonly signer?: {
      presignPut(key: string, expiresSeconds: number): Promise<string>;
    },
  ) {
    super();
  }

  async put(key: string, body: Buffer): Promise<void> {
    await this.bucket.put(assertSafeStorageKey(key), body);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.bucket.get(assertSafeStorageKey(key));
  }

  async presignPut(key: string, expiresSeconds: number): Promise<string | null> {
    if (!this.signer) return null;
    return this.signer.presignPut(assertSafeStorageKey(key), expiresSeconds);
  }
}

type S3Like = {
  send(command: { input?: unknown }): Promise<{
    Body?: { transformToByteArray?: () => Promise<Uint8Array> };
  }>;
};

export function r2BucketFromS3(client: S3Like, bucket: string): ObjectBucket {
  return {
    async put(key, body) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    },
    async get(key) {
      try {
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        const bytes = await result.Body?.transformToByteArray?.();
        return bytes ? Buffer.from(bytes) : null;
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (name === 'NoSuchKey' || name === 'NotFound') return null;
        throw error;
      }
    },
  };
}

export async function createR2ObjectStorage(): Promise<R2ObjectStorage | null> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  const { S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.CLOUDFLARE_R2_DEFAULT_REGION?.trim() || 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.CLOUDFLARE_R2_USE_PATH_STYLE_ENDPOINT !== 'false',
  });
  const signer = {
    async presignPut(key: string, expiresSeconds: number) {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: 'application/octet-stream',
        }),
        { expiresIn: expiresSeconds },
      );
    },
  };
  return new R2ObjectStorage(r2BucketFromS3(client, bucket), signer);
}

export function createObjectStorage(): ObjectStorage {
  const root = process.env.STORAGE_DIR?.trim();
  return root ? new LocalObjectStorage(root) : new MemoryObjectStorage();
}
