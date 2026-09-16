import { describe, expect, it, vi } from 'vitest';
import { AdminLibraryService } from './admin-library.service.js';

const now = new Date('2026-09-16T00:00:00Z');
const category = {
  id: 'cat',
  name: 'Hướng dẫn',
  description: '',
  version: 1,
  createdAt: now,
  updatedAt: now,
  _count: { documents: 0 },
};
const document = {
  id: 'doc',
  categoryId: 'cat',
  title: 'Bắt đầu',
  content: '# Xin chào',
  sourcePath: 'docs/start.md',
  version: 1,
  createdAt: now,
  updatedAt: now,
};
function fixture() {
  const client = {
    adminCategory: {
      findUnique: vi.fn().mockResolvedValue(category),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...category, version: 2 }),
      findMany: vi.fn().mockResolvedValue([category]),
      create: vi.fn().mockResolvedValue(category),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adminDocument: {
      findUnique: vi.fn().mockResolvedValue(document),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...document, version: 2 }),
      findMany: vi.fn().mockResolvedValue([document]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue({ ...document, sourcePath: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(client),
  };
  return { client, service: new AdminLibraryService(client as never) };
}
describe('AdminLibraryService', () => {
  it('serializes category counts and timestamps', async () => {
    const { service } = fixture();
    expect(await service.categories()).toEqual([
      {
        id: 'cat',
        name: 'Hướng dẫn',
        description: '',
        version: 1,
        createdAt: '2026-09-16T00:00:00.000Z',
        updatedAt: '2026-09-16T00:00:00.000Z',
        documentCount: 0,
      },
    ]);
  });
  it('lists summaries without content and searches title/content with pagination', async () => {
    const { client, service } = fixture();
    const result = await service.documents({
      query: 'xin',
      categoryId: 'cat',
      offset: 10,
      limit: 5,
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).not.toHaveProperty('content');
    expect(client.adminDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
        where: {
          categoryId: 'cat',
          OR: [
            { title: { contains: 'xin', mode: 'insensitive' } },
            { content: { contains: 'xin', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
  it('combines exact source provenance resolution with category/search filters', async () => {
    const { client, service } = fixture();
    await service.documents({
      query: 'start',
      sourcePath: 'docs/start.md',
      categoryId: 'cat',
      offset: 0,
      limit: 1,
    });
    expect(client.adminDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourcePath: 'docs/start.md',
          categoryId: 'cat',
        }),
      }),
    );
    expect(client.adminDocument.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        sourcePath: 'docs/start.md',
        categoryId: 'cat',
      }),
    });
  });
  it('returns category creation and persisted updates with incremented versions', async () => {
    const { service } = fixture();
    expect(
      await service.createCategory({ name: 'Hướng dẫn', description: '' }),
    ).toMatchObject({ documentCount: 0, version: 1 });
    expect(
      await service.updateCategory('cat', {
        name: 'N',
        description: '',
        version: 1,
      }),
    ).toMatchObject({ version: 2, documentCount: 0 });
    expect(
      await service.updateDocument('doc', {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 1,
      }),
    ).toMatchObject({ version: 2, sourcePath: 'docs/start.md' });
    await expect(
      service.deleteDocument('doc', { version: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      service.deleteCategory('cat', { version: 1 }),
    ).resolves.toBeUndefined();
  });
  it('reads full document with immutable source provenance', async () => {
    expect(await fixture().service.document('doc')).toMatchObject({
      content: '# Xin chào',
      sourcePath: 'docs/start.md',
      createdAt: '2026-09-16T00:00:00.000Z',
    });
  });
  it('returns 404 for unknown documents and mutation targets', async () => {
    const { client, service } = fixture();
    client.adminDocument.findUnique.mockResolvedValue(null);
    client.adminCategory.findUnique.mockResolvedValue(null);
    await expect(service.document('missing')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.updateDocument('missing', {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.deleteDocument('missing', { version: 1 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.updateCategory('missing', {
        name: 'N',
        description: '',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.deleteCategory('missing', { version: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects stale writes/deletes for both record kinds', async () => {
    const { service } = fixture();
    await expect(
      service.updateCategory('cat', { name: 'N', description: '', version: 2 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.deleteCategory('cat', { version: 2 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateDocument('doc', {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 2,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.deleteDocument('doc', { version: 2 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a nonempty category deletion', async () => {
    const { client, service } = fixture();
    client.adminCategory.findUnique.mockResolvedValue({
      ...category,
      _count: { documents: 1 },
    });
    await expect(
      service.deleteCategory('cat', { version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('uses version predicates to reject a concurrent modification after the initial read', async () => {
    const { client, service } = fixture();
    client.adminCategory.updateMany.mockResolvedValue({ count: 0 });
    client.adminDocument.updateMany.mockResolvedValue({ count: 0 });
    client.adminCategory.deleteMany.mockResolvedValue({ count: 0 });
    client.adminDocument.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateCategory('cat', { name: 'N', description: '', version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateDocument('doc', {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.deleteCategory('cat', { version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.deleteDocument('doc', { version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(client.adminCategory.updateMany).toHaveBeenCalledWith({
      where: { id: 'cat', version: 1 },
      data: { name: 'N', description: '', version: { increment: 1 } },
    });
    expect(client.adminDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc', version: 1 },
      data: {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: { increment: 1 },
      },
    });
    expect(client.adminCategory.deleteMany).toHaveBeenCalledWith({
      where: { id: 'cat', version: 1 },
    });
    expect(client.adminDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: 'doc', version: 1 },
    });
  });
  it('creates documents with no source path and requires an existing category', async () => {
    const { client, service } = fixture();
    expect(
      await service.createDocument({
        categoryId: 'cat',
        title: 'T',
        content: '',
      }),
    ).toMatchObject({ sourcePath: null });
    expect(client.adminDocument.create).toHaveBeenCalledWith({
      data: { categoryId: 'cat', title: 'T', content: '', sourcePath: null },
    });
    client.adminCategory.findUnique.mockResolvedValue(null);
    await expect(
      service.createDocument({
        categoryId: 'missing',
        title: 'T',
        content: '',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('translates category FK races to conflict for create/update/delete', async () => {
    const { client, service } = fixture();
    client.adminDocument.create.mockRejectedValue({ code: 'P2003' });
    client.adminDocument.updateMany.mockRejectedValue({ code: 'P2003' });
    client.adminCategory.deleteMany.mockRejectedValue({ code: 'P2003' });
    await expect(
      service.createDocument({ categoryId: 'cat', title: 'T', content: '' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateDocument('doc', {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.deleteCategory('cat', { version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
