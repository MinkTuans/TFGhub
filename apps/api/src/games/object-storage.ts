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
