# Important commits

This curated list highlights architectural turning points on the current application lineage. Use `git show <hash>` and current source for detail.

## Foundation

- `1ced7d03dcd3699f7cc19986baed2c7ad44b7661` — scaffold monorepo and package boundaries.
- `4b9e7bc26d73c02aa1d4bbfe81622e80a670e6ab` — shared domain contracts.
- `2d0ff7b37266152f58f60fba41a31872c61dd069` — account authentication.
- `722a7cd25b75e1d0819b2faa1776891b112fa388` — browser mutation protection and Prisma preparation.

## Deployment and persistence

- `3d9920a8fcad4213ca0bd103e6cbf0afd10fab0d` — production Compose/Caddy topology.
- `c42d3896f3bb15458aafbeaa6cd33cc7ddc4d16a` — clean database restore procedure.
- `7d30467d24898280967285f37137adbf311fe658` — durable game artifact volume.

## Publishing and security

- `7f54009d5759a9ab05c5f487e18c9d75828a84f5` — game sources and review state.
- `1e15709266691be9f9dada5a51f6ce2bfef5579a` — bounded artifact compilation.
- `d56b6bb953220e1fba7a1046c64702521b6d7d0e` — reject symlink artifact reads.
- `56e8028ac62f487347662babd117d486c1508dc1` — immutable published artifacts.
- `5cc80eacccbe7ed3931e95645b7e9d9eb4897245` — scoped sandbox capabilities.
- `b8138bc5abf027040bb414017b154a057f19e94d` — moderated publication.

## Engine and database

- `cd87a4884a0cedb76b305e109be8bee37b367f12` — engine-core project schema.
- `d19f26fbf73a0b9c5f4d2c7c113cbb610b1dde01` — deterministic legacy adapters.
- `48df9977220b9bd2d959665b273853e428fc6d29` — engine lifecycle schema.
- `d0de2eaa9ec06edd6b15bcb507ab8ae1d589f4b7` — revision persistence API.
- `6fd369311fd3919079787620088f4403b5297c14` — Engine Project V2 aggregate.
- `24eb90b4b4e45a9cd551341b6086aa7190b04e08` — deterministic V1→V2 upgrade.
- `89279fe28a69bf820daefb9f17049068fad4d6d5` — idempotent mutation batches.

## Studio and assets

- `f71470d4481dd565e616dd1fb6436a647aa03a03` — unified ENGINE draft creation.
- `c522334cd17b9e7863e2cdedab3db5e2a720c217` — recoverable autosave.
- `21df6d57e04f49a6585897b6f40ac82651221fb2` — canonical Canvas2D scene rendering.
- `cac0aa7649ee7e558d55b57833248b7335bd14b4` — canvas gestures.
- `9674be66542440fdcb663192fddf16f484066f01` — hierarchy and inspector.
- `1860920102aaa4f00e9b6aa14426516a0245e596` — immutable asset lifecycle.
- `a4fca5d5ddd21960f092e87aa733a8cb378c7b3e` — upload reservation identity hardening.
- `abcd315dd37614d59a9e6da44dd44c4fcf741a4b`, `1c43155772ecd0413ff6936c7dc4ef13199edd1c`, `f2cdc9dec02c52e7219ca06cdd6b3b10725b51da` — Asset Manager series.

Parallel deployment histories also exist in Git. Prefer the hashes above because they are ancestors of the current application branch.
