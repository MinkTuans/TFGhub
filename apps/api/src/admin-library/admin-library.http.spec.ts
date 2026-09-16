import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthUsersRepository } from '../auth/auth.service.js';
import { configureApp } from '../configure-app.js';
import { AdminLibraryModule } from './admin-library.module.js';
import { AdminLibraryService } from './admin-library.service.js';

const routes = [
  ['get', '/categories'],
  ['post', '/categories'],
  ['patch', '/categories/cat'],
  ['delete', '/categories/cat'],
  ['get', '/documents'],
  ['get', '/documents/doc'],
  ['post', '/documents'],
  ['patch', '/documents/doc'],
  ['delete', '/documents/doc'],
] as const;
describe('Admin library HTTP boundary', () => {
  let app: INestApplication;
  let cookie: string;
  let role = 'ADMIN';
  const service = {
    categories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: 'cat' }),
    updateCategory: vi.fn().mockResolvedValue({ id: 'cat' }),
    deleteCategory: vi.fn(),
    documents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    document: vi.fn().mockResolvedValue({ id: 'doc', content: '# Xin chào' }),
    createDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
    updateDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
    deleteDocument: vi.fn(),
  };
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'admin-library-unit-test-secret');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    const module = await Test.createTestingModule({
      imports: [AdminLibraryModule],
    })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        findById: async () => ({
          id: 'user',
          email: 'admin@example.test',
          role,
        }),
      })
      .overrideProvider(AdminLibraryService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    cookie = `indieforge_access=${await module.get(JwtService).signAsync({ sub: 'user', role: 'ADMIN' })}`;
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  it.each(routes)('rejects guests on %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method](`/admin/library${path}`)
      .send({})
      .expect(401);
  });
  it.each(['USER', 'MODERATOR'])(
    'checks fresh %s role even when cookie claims ADMIN',
    async (freshRole) => {
      role = freshRole;
      for (const [method, path] of routes)
        await request(app.getHttpServer())
          [method](`/admin/library${path}`)
          .set('Cookie', cookie)
          .send({})
          .expect(403);
      role = 'ADMIN';
    },
  );
  it('returns private no-store for all reads', async () => {
    for (const path of ['/categories', '/documents', '/documents/doc']) {
      const response = await request(app.getHttpServer())
        .get(`/admin/library${path}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });
  it('routes valid creates, updates and versioned deletes with expected statuses', async () => {
    const category = { name: 'Hướng dẫn', description: '' };
    const document = {
      categoryId: 'cat',
      title: 'Tài liệu',
      content: '# Nội dung',
    };
    for (const [kind, input] of [
      ['categories', category],
      ['documents', document],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/admin/library/${kind}`)
        .set('Cookie', cookie)
        .send(input)
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/admin/library/${kind}/id`)
        .set('Cookie', cookie)
        .send({ ...input, version: 1 })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/admin/library/${kind}/id`)
        .set('Cookie', cookie)
        .send({ version: 1 })
        .expect(204);
    }
  });
  it.each([
    ['post', '/categories', { name: '', description: '' }],
    ['patch', '/categories/cat', { name: 'N', description: '' }],
    ['delete', '/categories/cat', { version: 0 }],
    [
      'post',
      '/documents',
      { categoryId: 'cat', title: 'T', content: '', sourcePath: '/etc/passwd' },
    ],
    [
      'patch',
      '/documents/doc',
      {
        categoryId: 'cat',
        title: 'T',
        content: '',
        version: 1,
        sourcePath: 'docs/x.md',
      },
    ],
    ['delete', '/documents/doc', { version: '1' }],
  ] as const)(
    'rejects invalid or immutable fields on %s %s',
    async (method, path, body) => {
      await request(app.getHttpServer())
        [method](`/admin/library${path}`)
        .set('Cookie', cookie)
        .send(body)
        .expect(400);
    },
  );
  it.each([
    'limit=101',
    'offset=-1',
    'unknown=value',
    'query=' + 'a'.repeat(201),
  ])('rejects malformed query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/admin/library/documents?${query}`)
      .set('Cookie', cookie)
      .expect(400);
  });
  it('rejects cross-origin writes and browser writes without Origin', async () => {
    await request(app.getHttpServer())
      .post('/admin/library/categories')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ name: 'N', description: '' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/admin/library/documents/doc')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ version: 1 })
      .expect(403);
  });
});
