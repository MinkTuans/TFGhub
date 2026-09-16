// Test-only storage adapter. Controllers, services, password hashing, JWT guards,
// cookies and CORS are the production Nest implementation.
import { createRequire } from "node:module";
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
const requireApi = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Test } = requireApi("@nestjs/testing");
const { AppModule } = await import("../../api/dist/app.module.js");
const { configureApp } = await import("../../api/dist/configure-app.js");
const { argon2id, hash } = requireApi("argon2");
const { AuthUsersRepository } =
  await import("../../api/dist/auth/auth.service.js");
const { DeveloperProfilesRepository } =
  await import("../../api/dist/developers/developers.service.js");
const { GamesRepository } =
  await import("../../api/dist/games/games.service.js");
const { PublicGamesRepository } =
  await import("../../api/dist/games/public-games.service.js");
const { ArtifactStorage } =
  await import("../../api/dist/game-artifacts/artifact-storage.js");
// Never reuse application storage or artifacts from a previous browser run.
const storageRoot = await mkdtemp(join(tmpdir(), "tfg-browser-"));
process.env.GAME_STORAGE_ROOT = storageRoot;
process.env.JWT_SECRET = "browser-tests-only-explicit-long-signing-secret";
process.env.WEB_ORIGIN = "http://localhost:3100";
const users = new Map([
  [
    "moderator-1",
    {
      id: "moderator-1",
      email: "moderator@example.com",
      passwordHash: await hash("moderator-password123", { type: argon2id }),
      role: "MODERATOR",
    },
  ],
]);
const profiles = new Map([
  ["seed-owner", { displayName: "Minh", bio: "Small adventures." }],
]);
const dates = {
  createdAt: new Date("2026-09-05T00:00:00Z"),
  updatedAt: new Date("2026-09-05T00:00:00Z"),
};
const games = new Map([
  [
    "seed-game",
    {
      id: "seed-game",
      ownerId: "seed-owner",
      slug: "tiny-quest",
      title: "Tiny Quest",
      description: "A small adventure.",
      visibility: "PUBLIC",
      moderationState: "CLEAR",
      accessMode: "GUEST_ALLOWED",
      sourceType: "UPLOAD",
      reviewState: "APPROVED",
      projectData: null,
      artifactVersion: 1,
      artifactReady: true,
      coverVersion: 0,
      coverContentType: null,
      viewportWidth: 16,
      viewportHeight: 9,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
      ...dates,
    },
  ],
]);
games.set("seed-related", {
  ...games.get("seed-game"),
  id: "seed-related",
  slug: "moon-garden",
  title: "Moon Garden",
  description: "A quiet garden under the moon.",
  artifactVersion: 0,
  artifactReady: false,
});
const publicRows = (where) =>
  [...games.values()]
    .filter(
      (game) =>
        game.visibility === where.visibility &&
        game.moderationState === where.moderationState &&
        game.reviewState === where.reviewState &&
        (!where.slug || where.slug === game.slug) &&
        (!where.OR ||
          where.OR.some((clause) =>
            Object.entries(clause).some(([field, filter]) =>
              game[field].toLowerCase().includes(filter.contains.toLowerCase()),
            ),
          )),
    )
    .map((game) => ({
      ...game,
      owner: { profile: profiles.get(game.ownerId) ?? null },
    }))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
const testingModule = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AuthUsersRepository)
  .useValue({
    async create(input) {
      if ([...users.values()].some((user) => user.email === input.email))
        throw { code: "P2002", meta: { target: ["email"] } };
      const user = { ...input, id: `user-${users.size + 1}`, role: "USER" };
      users.set(user.id, user);
      return user;
    },
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
  })
  .overrideProvider(DeveloperProfilesRepository)
  .useValue({
    async findByUserId(id) {
      return profiles.get(id) ?? null;
    },
    async upsert(id, profile) {
      profiles.set(id, profile);
      return profile;
    },
  })
  .overrideProvider(GamesRepository)
  .useValue({
    async create(input) {
      if ([...games.values()].some((game) => game.slug === input.slug))
        throw { code: "P2002", meta: { target: ["slug"] } };
      const game = {
        ...input,
        id: `game-${games.size + 1}`,
        ...dates,
        sourceType: input.sourceType ?? "UPLOAD",
        reviewState: "DRAFT",
        projectData: null,
        artifactVersion: 0,
        artifactReady: false,
        coverVersion: 0,
        coverContentType: null,
        viewportWidth: input.viewportWidth ?? 16,
        viewportHeight: input.viewportHeight ?? 9,
        reviewNote: null,
        submittedAt: null,
        reviewedAt: null,
      };
      games.set(game.id, game);
      return game;
    },
    async findManyByOwner(ownerId) {
      return [...games.values()].filter((game) => game.ownerId === ownerId);
    },
    async findUnique(id) {
      return games.get(id) ?? null;
    },
    async lockForArtifactReconciliation(id) {
      return games.get(id) ?? null;
    },
    async findBySlug(slug) {
      return [...games.values()].find((game) => game.slug === slug) ?? null;
    },
    async updateWorkspace(id, expectedUpdatedAt, input) {
      const current = games.get(id);
      if (!current || current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        return null;
      const game = { ...current, ...input, updatedAt: new Date() };
      games.set(id, game);
      return game;
    },
    async submit(id) {
      const current = games.get(id);
      if (
        !current ||
        !["DRAFT", "REJECTED"].includes(current.reviewState) ||
        current.artifactVersion < 1 ||
        !current.artifactReady
      )
        return null;
      const game = {
        ...current,
        visibility: "DRAFT",
        reviewState: "PENDING",
        reviewNote: null,
        submittedAt: new Date(),
        reviewedAt: null,
        updatedAt: new Date(),
      };
      games.set(id, game);
      return game;
    },
    async approve(id, revision) {
      const current = games.get(id);
      if (
        !current || current.reviewState !== "PENDING" ||
        current.artifactVersion !== revision.artifactVersion ||
        current.submittedAt?.getTime() !== revision.submittedAt.getTime()
      ) return null;
      const game = {
        ...current,
        visibility: "PUBLIC",
        reviewState: "APPROVED",
        reviewNote: null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };
      games.set(id, game);
      return game;
    },
    async reject(id, revision, reviewNote) {
      const current = games.get(id);
      if (
        !current || current.reviewState !== "PENDING" ||
        current.artifactVersion !== revision.artifactVersion ||
        current.submittedAt?.getTime() !== revision.submittedAt.getTime()
      ) return null;
      const game = {
        ...current,
        visibility: "DRAFT",
        reviewState: "REJECTED",
        reviewNote,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };
      games.set(id, game);
      return game;
    },
    async findPending() {
      return [...games.values()]
        .filter((game) => game.reviewState === "PENDING")
        .map((game) => ({
          ...game,
          creator: {
            id: game.ownerId,
            displayName: profiles.get(game.ownerId)?.displayName ?? null,
          },
        }));
    },
    async updateOwned(id, ownerId, expectedUpdatedAt, input) {
      const current = games.get(id);
      if (
        !current ||
        current.ownerId !== ownerId ||
        current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        return null;
      const game = { ...current, ...input, updatedAt: new Date() };
      games.set(id, game);
      return game;
    },
    async updateCover(id, ownerId, expectedUpdatedAt, expectedCoverVersion, input) {
      const current = games.get(id);
      if (!current || current.ownerId !== ownerId ||
          current.updatedAt.getTime() !== expectedUpdatedAt.getTime() ||
          current.coverVersion !== expectedCoverVersion) return null;
      const game = { ...current, ...input, updatedAt: new Date() };
      games.set(id, game);
      return game;
    },
    async update(id, input) {
      const game = { ...games.get(id), ...input };
      games.set(id, game);
      return game;
    },
  })
  .overrideProvider(PublicGamesRepository)
  .useValue({
    async findMany({ where, cursor, take }) {
      const rows = publicRows(where);
      const start = cursor
        ? rows.findIndex((game) => game.id === cursor.id) + 1
        : 0;
      return rows.slice(start, start + take);
    },
    async findBySlug({ where }) {
      return publicRows(where)[0] ?? null;
    },
  })
  .compile();
await testingModule.get(ArtifactStorage).install("seed-game", 1, [{
  path: "index.html",
  contentType: "text/html",
  content: '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Tiny Quest</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:#101527;color:#eef2ff;font-family:sans-serif}h1{font-size:clamp(1rem,5vw,3rem)}</style><h1>Tiny Quest</h1></html>',
}]);
const app = testingModule.createNestApplication();
// Test-only fault injection; never registered by the production API entry point.
let apiFault = "off";
app.use((request, response, next) => {
  if ((apiFault === "session" && request.path === "/auth/me") ||
      (apiFault === "game" && request.path === "/games/by-slug/tiny-quest")) {
    response.status(503).json({ message: "test-only upstream failure" });
    return;
  }
  if (apiFault === "discover-delay" && request.path === "/discover") {
    setTimeout(next, 2000);
    return;
  }
  next();
});
configureApp(app);
await app.listen(3101, "localhost");

// Match Caddy's /api prefix stripping while exercising actual HTTP requests.
// Forward the original Host/Origin/Cookie headers and stream bodies unchanged.
function forward(request, onResponse) {
  const api = /^\/api(?:\/|\?|$)/.test(request.url);
  const path = api ? request.url.slice(4) : request.url;
  return httpRequest({
    hostname: "localhost",
    port: api ? 3101 : 3102,
    method: request.method,
    path: !path || path.startsWith("?") ? `/${path}` : path,
    headers: request.headers,
  }, onResponse);
}

const gateway = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost:3100");
  if (request.method === "POST" && url.pathname === "/__test/api-fault") {
    const fault = url.searchParams.get("mode");
    if (!["off", "session", "game", "discover-delay"].includes(fault)) {
      response.writeHead(400).end();
      return;
    }
    apiFault = fault;
    response.writeHead(204).end();
    return;
  }
  const upstream = forward(request, (reply) => {
    // rawHeaders preserves repeated headers, including multiple Set-Cookie.
    response.writeHead(reply.statusCode, reply.rawHeaders);
    reply.on("error", () => response.destroy());
    reply.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
});

// Next dev uses a WebSocket; forwarding upgrades avoids reconnect/reload noise.
gateway.on("upgrade", (request, socket, head) => {
  const upstream = forward(request, () => socket.end());
  upstream.on("upgrade", (reply, upstreamSocket, upstreamHead) => {
    const headers = reply.rawHeaders.reduce((lines, value, index, all) =>
      index % 2 === 0 ? `${lines}${value}: ${all[index + 1]}\r\n` : lines, "");
    socket.write(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\n${headers}\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.on("error", () => upstreamSocket.destroy());
    socket.on("close", () => upstreamSocket.destroy());
    upstreamSocket.on("error", () => socket.destroy());
    upstreamSocket.on("close", () => socket.destroy());
    socket.pipe(upstreamSocket).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});
const sockets = new Set();
gateway.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((resolve, reject) => {
  gateway.once("error", reject);
  gateway.listen(3100, "localhost", resolve);
});

// Production storage seals published directories; only unseal this run's root.
async function writable(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await writable(join(directory, entry.name));
  }
}

let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    if (closing) return;
    closing = true;
    try {
      const stopped = new Promise((resolve) => gateway.close(resolve));
      for (const socket of sockets) socket.destroy();
      await stopped;
      await app.close();
      await writable(storageRoot);
      await rm(storageRoot, { recursive: true, force: true });
      process.exit(0);
    } catch (error) {
      console.error("Browser harness cleanup failed", error);
      process.exit(1);
    }
  });
