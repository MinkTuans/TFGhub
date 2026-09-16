# Vietnamese community demonstration seed

This dataset is explicitly synthetic. It contains 30 Vietnamese display names, 10 different playable CODE games, 56 user–game memberships, 280 plays/scores, 46 ratings and 46 individually written Vietnamese comments. Each game's 4–7 participants include its creator. Nobody rates their own game. A user participates in one to five games.

Existing application schema and runtime logic are unchanged:

| Output | Existing storage |
|---|---|
| Account, signup date | `User.id/email/passwordHash/role/isActive/createdAt` |
| Name and biography | `DeveloperProfile.userId/displayName/bio` |
| Game, owner, source, status, dates | `Game`, owner FK → `User.id` |
| Genre | Text in `Game.description`; no category column exists |
| Username | Export-only alias derived from email; no username column exists |
| Memberships | Derived from `Game.ownerId` and `GamePlay.userId/gameId` |
| Playtime and participant count | `GamePlay.activeSeconds/createdAt/participantKey` |
| Scores | `GameScore.playId` FK → `GamePlay.id`, maximum per game/user computed from plays |
| Stars | `GameRating` composite key `(gameId,userId)` |
| Comments | `GameComment` with real FKs and chronological `createdAt` |
| Comment cooldown | `GameCommentCooldown` for each seeded comment author/game |
| Revenue, payments, avatars | Unsupported; no invented fields or revenue |

`GameRating` has no timestamp. Comments and plays have varied dates after game creation and account registration; the seed does not pretend to persist a rating timestamp. All ten games are public/approved so they can be played from the existing interface. Existing CODE artifact format is installed with the current compiler and immutable artifact storage. New games are inserted as approved demo data; this is an explicit administrative seed, not simulated moderator actions.

Every new account has the regular USER role, its own random unknown password hashed with Argon2id, and a reserved `@seed.tfg.example` address. No shared login password, live email delivery, user role elevation, or exposed token is created. The user-facing game descriptions and profile biographies disclose their demo origin.

## Export

From the repository root:

```sh
node scripts/seed-community/seed.mjs --output docs/11-history/datasets/2026-09-16-community
node --test scripts/seed-community/data.test.mjs
```

The export includes all projects, accounts, memberships, detailed plays/scores/ratings/comments, game summaries and per-user summaries, but no password hash, JWT secret, session token or derived participant HMAC. It is deterministic and uses dates through 2026-09-15.

## Apply

Requires existing generated Prisma client/API build, configured `DATABASE_URL`, `JWT_SECRET` and `GAME_STORAGE_ROOT`. Explicitly set `SEED_EXPECTED_DATABASE` to the target database name and `SEED_CONFIRM=vietnam-community-20260916-v1`, then:

```sh
node scripts/seed-community/seed.mjs --apply
```

Back up database and artifact storage first on a live deployment. A transaction and advisory lock serialize concurrent applications. Existing account/game identity collisions or partial seed footprints abort. Complete repeats verify expected FKs, cooldown rows, scores/ratings and original artifact bytes before returning without writes. Later profile edits and new interactions remain intact. No upsert overwrites existing rows.

If DB insertion fails after artifact installation, only new namespace artifacts may remain. Retry verifies their bytes before reusing them. No published artifact is overwritten. A deleted/changed original artifact or partial seed requires inspection, not blind reseeding. There is no bulk-delete/reset command for production.

## Disposable integration check

`scripts/seed-community/integration.mjs` accepts only a local PostgreSQL database named `community_seed_test`. Start with an empty migrated database and a separate `GAME_STORAGE_ROOT`. It checks failure rollback/artifact retry, concurrent and repeated execution, collision detection, existing account preservation and exact counts. It deliberately creates a non-seed sentinel account in that disposable database.
