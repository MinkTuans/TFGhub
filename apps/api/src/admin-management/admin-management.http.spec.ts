import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthUsersRepository } from '../auth/auth.service.js';
import { configureApp } from '../configure-app.js';
import { AdminManagementModule } from './admin-management.module.js';
import { AdminManagementService } from './admin-management.service.js';
const routes = [
  ['get', '/users'],
  ['post', '/users'],
  ['get', '/users/u'],
  ['patch', '/users/u'],
  ['delete', '/users/u'],
  ['get', '/games'],
  ['get', '/games/g'],
  ['patch', '/games/g'],
  ['delete', '/games/g'],
] as const;
describe('Admin management HTTP boundary', () => {
  let app: INestApplication;
  let cookie: string;
  let role = 'ADMIN';
  let active = true;
  const service = Object.fromEntries(
    [
      'users',
      'user',
      'createUser',
      'updateUser',
      'deleteUser',
      'games',
      'game',
      'updateGame',
      'deleteGame',
    ].map((name) => [name, vi.fn().mockResolvedValue({ items: [], total: 0 })]),
  );
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'admin-management-unit-test-secret');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    const module = await Test.createTestingModule({
      imports: [AdminManagementModule],
    })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        findById: async () =>
          active ? { id: 'actor', email: 'admin@example.test', role } : null,
      })
      .overrideProvider(AdminManagementService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    cookie = `indieforge_access=${await module.get(JwtService).signAsync({ sub: 'actor', role: 'ADMIN' })}`;
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  it.each(routes)('rejects guest %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method](`/admin${path}`)
      .send({})
      .expect(401);
  });
  it.each(['USER', 'MODERATOR'])(
    'requires fresh ADMIN role, not token role (%s)',
    async (fresh) => {
      role = fresh;
      for (const [method, path] of routes)
        await request(app.getHttpServer())
          [method](`/admin${path}`)
          .set('Cookie', cookie)
          .send({})
          .expect(403);
      role = 'ADMIN';
    },
  );
  it('rejects an existing token after the account becomes inactive', async () => {
    active = false;
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', cookie)
      .expect(401);
    active = true;
  });
  it('sets private no-store on every GET', async () => {
    for (const [method, path] of routes.filter(
      ([method]) => method === 'get',
    )) {
      const response = await request(app.getHttpServer())
        [method](`/admin${path}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });
  it('validates and routes authorized mutations with the fresh actor ID', async () => {
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Cookie', cookie)
      .send({ email: 'new@example.test', password: 'StrongPass1!' })
      .expect(201);
    expect(service.createUser).toHaveBeenCalledWith('actor', {
      email: 'new@example.test',
      password: 'StrongPass1!',
      role: 'USER',
      isActive: true,
    });
    await request(app.getHttpServer())
      .patch('/admin/users/u')
      .set('Cookie', cookie)
      .send({ version: 1, isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/admin/users/u')
      .set('Cookie', cookie)
      .send({ version: 1 })
      .expect(204);
    await request(app.getHttpServer())
      .patch('/admin/games/g')
      .set('Cookie', cookie)
      .send({ updatedAt: '2026-09-16T00:00:00.000Z', visibility: 'DRAFT' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/admin/games/g')
      .set('Cookie', cookie)
      .send({ updatedAt: '2026-09-16T00:00:00.000Z' })
      .expect(204);
  });
  it.each([
    ['patch', '/users/u', { role: 'ADMIN' }],
    ['delete', '/users/u', { version: 0 }],
    ['post', '/users', { email: 'a@example.test', password: 'short' }],
    [
      'patch',
      '/games/g',
      { updatedAt: '2026-09-16T00:00:00.000Z', reviewState: 'APPROVED' },
    ],
    ['delete', '/games/g', {}],
  ] as const)('rejects invalid %s %s', async (method, path, body) => {
    await request(app.getHttpServer())
      [method](`/admin${path}`)
      .set('Cookie', cookie)
      .send(body)
      .expect(400);
  });
  it.each([
    '/users?active=no',
    '/games?limit=51',
    '/games?ownerId=',
    '/users?unknown=value',
  ])('rejects malformed query %s', async (path) => {
    await request(app.getHttpServer())
      .get(`/admin${path}`)
      .set('Cookie', cookie)
      .expect(400);
  });
  it('rejects cross-origin writes', async () => {
    await request(app.getHttpServer())
      .delete('/admin/users/u')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ version: 1 })
      .expect(403);
  });
});
