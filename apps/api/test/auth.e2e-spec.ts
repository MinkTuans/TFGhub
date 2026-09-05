import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AuthUsersRepository,
  type StoredUser,
} from '../src/auth/auth.service.js';

const testSecret = 'auth-tests-only-a-long-explicit-signing-secret';

describe('Authentication HTTP boundary', () => {
  let app: INestApplication;
  let users: Map<string, StoredUser>;
  const tokens = new JwtService({ secret: testSecret });
  const credentials = { email: ' DEV@Example.COM ', password: 'password123' };

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', testSecret);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    users = new Map();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUsersRepository)
      .useValue({
        async create(input: { email: string; passwordHash: string }) {
          if ([...users.values()].some((user) => user.email === input.email)) {
            throw { code: 'P2002', meta: { target: ['email'] } };
          }
          const user: StoredUser = { ...input, id: 'user-1', role: 'USER' };
          users.set(user.id, user);
          return user;
        },
        async findByEmail(email: string) {
          return (
            [...users.values()].find((user) => user.email === email) ?? null
          );
        },
        async findById(id: string) {
          return users.get(id) ?? null;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.unstubAllEnvs();
  });

  async function register() {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);
  }

  it('registers a normalized user, stores Argon2id, and issues a 15-minute HTTP-only cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, role: 'ADMIN' })
      .expect(201);
    expect(response.body).toEqual({
      id: 'user-1',
      email: 'dev@example.com',
      role: 'USER',
    });
    expect(users.get('user-1')?.passwordHash).toMatch(/^\$argon2id\$/);
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toMatch(/^indieforge_access=/);
    expect(cookie).toContain('Max-Age=900');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    const payload = tokens.verify(cookie.split(';')[0].split('=')[1]);
    expect(payload).toEqual({
      sub: 'user-1',
      role: 'USER',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('maps a duplicate normalized email to 409 without issuing another cookie', async () => {
    await register();
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, email: 'dev@example.com' })
      .expect(409);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    { email: 'invalid', password: 'password123' },
    { email: 'dev@example.com', password: 'short' },
    { email: 'dev@example.com', password: 'x'.repeat(129) },
    { email: 42, password: 'password123' },
    {},
  ])(
    'rejects invalid credentials at both public endpoints: %j',
    async (body) => {
      for (const route of ['register', 'login']) {
        await request(app.getHttpServer())
          .post(`/auth/${route}`)
          .send(body)
          .expect(400);
      }
      expect(users.size).toBe(0);
    },
  );

  it('logs in with the real stored hash and uses the cookie to retrieve a public user', async () => {
    await register();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send(credentials)
      .expect(200)
      .expect('set-cookie', /indieforge_access=/);
    await agent
      .get('/auth/me')
      .expect(200, { id: 'user-1', email: 'dev@example.com', role: 'USER' });
  });

  it('returns the same unauthorized response for absent users and wrong passwords', async () => {
    const absent = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(401);
    await register();
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, password: 'wrong-password' })
      .expect(401);
    expect(wrong.body).toEqual(absent.body);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('rejects missing cookies and ignores bearer authorization', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await register();
    await request(app.getHttpServer())
      .get('/auth/me')
      .set(
        'Authorization',
        `Bearer ${tokens.sign({ sub: 'user-1', role: 'USER' }, { expiresIn: '15m' })}`,
      )
      .expect(401);
  });

  it('rejects malformed, expired, forged, and structurally invalid tokens', async () => {
    await register();
    const invalidTokens = [
      'not-a-jwt',
      tokens.sign({ sub: 'user-1', role: 'USER' }, { expiresIn: -1 }),
      new JwtService({ secret: 'different-secret' }).sign(
        { sub: 'user-1', role: 'USER' },
        { expiresIn: '15m' },
      ),
      tokens.sign(
        { sub: 'user-1', role: 'USER' },
        { algorithm: 'HS384', expiresIn: '15m' },
      ),
      tokens.sign({ role: 'USER' }, { expiresIn: '15m' }),
      tokens.sign({ sub: 'user-1', role: 'INVALID' }, { expiresIn: '15m' }),
      tokens.sign({ sub: 'user-1', role: 'USER' }),
    ];
    for (const token of invalidTokens) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `indieforge_access=${token}`)
        .expect(401);
    }
  });

  it('rejects a deleted user and reflects the current database role', async () => {
    const response = await register();
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    users.get('user-1')!.role = 'MODERATOR';
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200, {
        id: 'user-1',
        email: 'dev@example.com',
        role: 'MODERATOR',
      });
    users.clear();
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('clears the cookie at logout and the browser session becomes unauthorized', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(credentials).expect(201);
    const response = await agent.post('/auth/logout').expect(204);
    expect(response.headers['set-cookie'][0]).toMatch(/^indieforge_access=;/);
    expect(response.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    expect(response.headers['set-cookie'][0]).toContain('Path=/');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    await agent.get('/auth/me').expect(401);
  });

  it('sets and clears a Secure cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await register();
    expect(response.headers['set-cookie'][0]).toContain('; Secure');
    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(204);
    expect(logout.headers['set-cookie'][0]).toContain('; Secure');
  });

  it('allows credentialed browser requests from the configured web origin', async () => {
    await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('rejects a hostile login form without installing an attacker session', async () => {
    await register();
    const victim = request.agent(app.getHttpServer());
    const response = await victim
      .post('/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .type('form')
      .send(credentials);

    expect(response.status).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    await victim.get('/auth/me').expect(401);
  });

  it.each([
    'https://attacker.example',
    'null',
    'http://localhost:3000.attacker.example',
  ])(
    'rejects authentication mutations from untrusted Origin %s',
    async (origin) => {
      for (const route of ['register', 'login', 'logout']) {
        const response = await request(app.getHttpServer())
          .post(`/auth/${route}`)
          .set('Origin', origin)
          .send(credentials)
          .expect(403);
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect(users.size).toBe(0);
    },
  );

  it('requires an Origin when browser fetch metadata is present', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Sec-Fetch-Site', 'same-origin')
      .send(credentials)
      .expect(403);
    expect(users.size).toBe(0);
  });

  it.each([
    'application/x-www-form-urlencoded',
    'text/plain',
    'multipart/form-data',
  ])(
    'rejects unsupported mutation content type %s even without an Origin',
    async (contentType) => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Content-Type', contentType)
        .send('email=dev%40example.com&password=password123')
        .expect(415);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('allows trusted browser JSON registration, login, and bodyless logout', async () => {
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send(credentials)
      .expect(201);
    await browser
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(credentials)
      .expect(200);
    await browser.get('/auth/me').expect(200);
    await browser
      .post('/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .expect(204);
    await browser.get('/auth/me').expect(401);
  });

  it.each([
    ['post', '/games'],
    ['patch', '/games/game-1'],
    ['put', '/developers/me'],
  ] as const)(
    'rejects hostile Origin on %s %s before mutation handling',
    async (method, route) => {
      await request(app.getHttpServer())
        [method](route)
        .set('Origin', 'https://attacker.example')
        .send({ title: 'Changed' })
        .expect(403);
    },
  );
});
