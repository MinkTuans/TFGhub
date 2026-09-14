import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve, sep } from 'node:path';

export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer | null>;
}

export class MemoryObjectStorage extends ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }

  async get(key: string): Promise<Buffer | null> {
    const value = this.objects.get(key);
    return value ? Buffer.from(value) : null;
  }
}

export class LocalObjectStorage extends ObjectStorage {
  constructor(private readonly root: string) {
    super();
  }

  private resolveKey(key: string): string {
    const relative = posix.normalize(key.replaceAll('\\', '/')).replace(/^\/+/, '');
    if (
      !relative ||
      relative === '.' ||
      relative.startsWith('../') ||
      relative.split('/').includes('..')
    ) {
      throw new Error('Invalid storage key');
    }
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

export function createObjectStorage(): ObjectStorage {
  const root = process.env.STORAGE_DIR?.trim();
  return root ? new LocalObjectStorage(root) : new MemoryObjectStorage();
}
