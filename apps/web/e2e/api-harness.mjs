// Test-only storage adapter. Controllers, services, password hashing, JWT guards,
// cookies and CORS are the production Nest implementation.
import { createRequire } from "node:module";
const requireApi = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Test } = requireApi("@nestjs/testing");
const { AppModule } = await import("../../api/dist/app.module.js");
const { configureApp } = await import("../../api/dist/configure-app.js");
const { AuthUsersRepository } =
  await import("../../api/dist/auth/auth.service.js");
const { DeveloperProfilesRepository } =
  await import("../../api/dist/developers/developers.service.js");
const { GamesRepository } =
  await import("../../api/dist/games/games.service.js");
const { PublicGamesRepository } =
  await import("../../api/dist/games/public-games.service.js");
process.env.JWT_SECRET = "browser-tests-only-explicit-long-signing-secret";
process.env.WEB_ORIGIN = "http://localhost:3100";
const users = new Map();
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
      artifactVersion: 0,
      artifactReady: false,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
      ...dates,
    },
  ],
]);
const publicRows = (where) =>
  [...games.values()]
    .filter(
      (game) =>
        game.visibility === where.visibility &&
        game.moderationState === where.moderationState &&
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
    async approve(id) {
      const current = games.get(id);
      if (!current || current.reviewState !== "PENDING") return null;
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
    async reject(id, reviewNote) {
      const current = games.get(id);
      if (!current || current.reviewState !== "PENDING") return null;
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
const app = testingModule.createNestApplication();
configureApp(app);
await app.listen(3101, "localhost");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
