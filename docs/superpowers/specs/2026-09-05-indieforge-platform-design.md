# IndieForge Platform Design

## 1. Product vision

IndieForge is a web-first game creation and publishing platform for beginners, independent developers, and small teams without an established audience. It reduces the path from a game idea to a playable public link while still supporting externally built games.

The platform combines:

- A browser-based 2D engine with no-code, visual, and TypeScript authoring.
- Hosting and distribution for HTML5, Unity WebGL, and Godot Web games.
- Later support for downloadable Windows, macOS, and Linux builds.
- Discovery features designed to surface new and promising games.
- Free-to-play distribution funded through donations and shared website advertising revenue.

## 2. Product areas

### Discover

Players browse, search, and discover new, trending, and promising games. Ranking must not depend only on historic popularity; it should reserve exposure for new releases and games with strong recent engagement.

### Play

Players launch web games directly in the browser. A developer may allow guest play or require authentication. Desktop downloads are introduced after the web publishing flow is stable.

### Create

Developers create 2D games in the browser using any combination of:

- No-code Event -> Condition -> Action blocks.
- A visual scene and component editor.
- TypeScript in an integrated code editor.

### Developer Studio

Developers manage game metadata, builds, releases, access rules, analytics, donations, reports, and estimated revenue.

## 3. Delivery phases

### Phase 1: publishing MVP

- User accounts and developer profiles.
- Upload and publish HTML5, Unity WebGL, and Godot Web builds.
- Automated build validation and security scanning.
- Isolated game pages and sandboxed browser play.
- Valid play and active-time analytics.
- Donation flow in a test payment environment.
- Basic discovery pages.
- Versioned releases and rollback.

### Phase 2: online engine foundation

- Phaser 3 runtime.
- Project templates and asset management.
- TypeScript editor and live preview.
- Scenes, sprites, input, collision, audio, animation, camera, and local save.
- One-click HTML5 publishing.

### Phase 3: visual and no-code authoring

- Visual scene editor.
- Component inspector.
- Event, condition, and action editor.
- Shared runtime and project format across all authoring modes.

### Phase 4: broader distribution and monetization

- Windows, macOS, and Linux downloads.
- Automated advertising revenue statements and payouts.
- Expanded discovery, community, and moderation tools.

Multiplayer, 3D creation, mobile package distribution, and a general asset marketplace are outside the initial scope.

## 4. Technical architecture

IndieForge starts as a modular monolith in a single monorepo. Modules have explicit boundaries so workers or high-traffic services can be extracted later without redesigning the product.

- **Web application:** Next.js, TypeScript, and Tailwind CSS provide player pages, discovery, Developer Studio, and the online editor.
- **API:** NestJS owns authentication, authorization, games, versions, publishing, analytics, donations, moderation, and revenue records.
- **Database:** PostgreSQL with Prisma stores users, projects, releases, sessions, events, reports, donations, and revenue statements.
- **Background jobs:** Redis and BullMQ run validation, scanning, deployment, preview generation, analytics aggregation, and retries.
- **Object storage:** Cloudflare R2 stores uploaded archives, immutable builds, images, and project assets.
- **Game runtime:** A separate domain serves immutable game builds inside sandboxed iframes.
- **Scanner worker:** An isolated worker validates archives and performs security checks before a build can be released.
- **Analytics worker:** An ingestion and aggregation worker records valid sessions and active play time.
- **Desktop packaging:** Tauri is the preferred later option because it produces smaller packages; Electron remains a fallback when compatibility requires it.

## 5. Core data model

- `User`: identity, roles, account state, and payout eligibility.
- `DeveloperProfile`: public creator identity and donation settings.
- `Game`: ownership, metadata, visibility, access mode, and moderation state.
- `GameVersion`: immutable upload, scan state, deployment state, and release metadata.
- `GameProject`: online-engine project and project format version.
- `Asset`: project or game media stored in object storage.
- `PlaySession`: pseudonymous session, game version, timestamps, and validation result.
- `PlayHeartbeat`: deduplicated evidence of active play.
- `Donation`: payment state, recipient, amount, fees, and idempotency key.
- `Report`: reported game, category, evidence, reporter, and resolution.
- `RevenuePeriod`: advertising revenue received, developer pool, and locked period status.
- `RevenueAllocation`: game score, creator share, adjustments, and audit trail.

Financial records and published game versions are immutable. Corrections use append-only adjustments instead of destructive updates.

## 6. Upload, scan, and publishing flow

1. The API creates a `GameVersion` in `UPLOADING` state and provides a short-lived direct-upload URL.
2. The client uploads to a quarantine area in R2 and supplies a checksum.
3. The API verifies completion and queues the version for scanning.
4. The scanner moves it to `SCANNING` and validates archive size, paths, file types, entry point, executable content, malware indicators, and suspicious external calls.
5. A rejected build enters `REJECTED` with actionable findings. It cannot be served from the game domain.
6. An accepted build enters `READY` and is deployed as immutable content.
7. Publishing atomically changes the game's active version. The previous release remains available for rollback.
8. Multiple credible reports or a high-severity automated finding can move a live game to `QUARANTINED` for manual review.

Transient worker failures retry with bounded exponential backoff. Content failures do not retry. A failed upload or release never replaces the current live version.

## 7. Runtime isolation and security

- Games run on a domain separate from the main application and cannot access its cookies or authentication tokens.
- Web games run in sandboxed iframes with the minimum required capabilities.
- Content Security Policy restricts script, network, popup, camera, microphone, and storage behavior.
- Uploaded paths are normalized to prevent archive traversal and unsafe extraction.
- Builds have file-count, compressed-size, expanded-size, and processing-time limits.
- Browser messages between the platform and game use a small, versioned, origin-checked protocol.
- Desktop downloads show scan results and an explicit warning that third-party software is being downloaded.
- Rate limits and audit logs cover upload, publishing, reporting, donations, and administrative actions.

Automated scanning reduces risk but is not presented as a guarantee that third-party software is safe.

## 8. Online engine design

Phaser 3 is the shared 2D runtime. Every project uses one portable structure:

```text
project.json
scenes/*.json
events/*.json
scripts/*.ts
assets/**
```

- `project.json` contains metadata, engine version, entry scene, and build settings.
- Scene files contain objects, transforms, and components.
- Event files contain no-code Event -> Condition -> Action graphs.
- TypeScript files contain custom behavior against a documented engine API.
- Assets contain images, audio, fonts, and animation data.

Visual and no-code edits update structured project data. TypeScript is compiled separately and can be used alongside structured logic. Arbitrary TypeScript is not converted back into no-code blocks because that transformation would be incomplete and could silently lose behavior.

The edit cycle is: choose a template, edit scenes and behavior, preview in a sandbox, build, scan, and publish.

## 9. Authentication and game access

Developers choose one access mode for each game:

- `GUEST_ALLOWED`: anyone can play; authentication is required only for actions such as donations, comments, or cloud saves.
- `AUTH_REQUIRED`: the player must sign in before a session begins.

Both modes produce analytics. Anonymous sessions receive stricter validation and can be weighted or excluded when fraud confidence is low. Public analytics never expose personal identifiers.

## 10. Analytics and revenue sharing

A play session uses a pseudonymous identifier. Heartbeats count only when the page is visible and recent user activity indicates active play. Background tabs, rapid reloads, duplicate events, known automation, and suspicious traffic patterns are excluded or flagged.

The initial allocation score is:

```text
game score = 30% normalized valid plays + 70% normalized valid active minutes
```

For each closed month:

```text
developer pool = eligible advertising revenue received * published sharing rate
game allocation = developer pool * game score / total platform score
```

The sharing rate, eligibility rules, normalization method, minimum payout, and currency handling must be versioned and disclosed before real payouts begin. Daily dashboard values are estimates. Month-end statements become immutable after fraud review, with later corrections recorded as adjustments.

Donations remain separate from advertising allocations. They use payment-provider webhooks and idempotency keys to prevent double processing. The platform may charge a clearly disclosed transaction fee.

Phase 1 records analytics and validates the formula. Automated payouts begin only after measurement quality and legal, tax, advertising, and payment-provider requirements are established.

## 11. Discovery and moderation

Discovery initially provides search, categories, new releases, and trending games. Ranking combines recent valid engagement, freshness, quality signals, and a controlled exploration allocation for games with limited exposure.

Games publish after automated checks rather than prior manual review. Users can report malware, prohibited content, copyright concerns, impersonation, or misleading metadata. High-confidence safety events can hide a game immediately; lower-confidence reports enter a moderation queue. Creators receive a reason and an appeal path.

## 12. Failure handling and observability

- Resumable uploads and checksums protect against interrupted or corrupted transfers.
- Queue jobs expose state, retry count, and a developer-facing failure reason where safe.
- Publishing is atomic and preserves the active release on failure.
- Analytics ingestion is idempotent and tolerant of duplicate or delayed events.
- Payment operations use idempotency keys and verified provider webhooks.
- Structured logs, metrics, traces, and audit records cover critical flows.
- Alerts monitor failed scans, publishing latency, analytics lag, payment failures, and abnormal traffic.

## 13. Testing strategy

- **Unit tests:** authorization, state transitions, archive validation, event deduplication, revenue calculations, and ranking inputs.
- **Integration tests:** upload -> scan -> deploy -> publish -> rollback; donation webhook processing; analytics aggregation.
- **End-to-end tests:** developer registration, game publishing, guest and authenticated play, reporting, and test donation.
- **Security tests:** archive traversal, malicious files, iframe isolation, CSP, cross-origin messaging, unauthorized access, and rate limits.
- **Compatibility fixtures:** representative Phaser, Unity WebGL, and Godot Web builds.
- **Load tests:** game delivery, heartbeat ingestion, release spikes, and monthly aggregation.

Financial formulas use fixed fixtures and reconciliation tests so the sum of allocations matches the distributable pool after explicit rounding rules.

## 14. MVP completion criteria

The publishing MVP is complete when:

- A developer can register, create a game page, and upload a supported web build.
- The build is automatically validated, scanned, and served only after approval.
- A player can open a public link and play without signing in when guest access is enabled.
- A developer can publish a new immutable version and roll back safely.
- Valid plays and active minutes appear accurately in Developer Studio.
- A test donation completes exactly once and appears in the creator dashboard.
- Report and quarantine workflows are usable by moderators.
- The critical user flows pass automated tests, and security tests confirm runtime-domain isolation.

## 15. Key decisions

- Build a modular monolith before considering microservices.
- Prioritize web publishing before the online engine and desktop downloads.
- Use one runtime and project format for code, visual, and no-code authoring.
- Allow developer-selected guest or authenticated access.
- Publish after automated checks, with report-driven manual moderation.
- Keep games free; support donations and later share website advertising revenue.
- Treat revenue estimates as provisional until a period is reviewed and locked.
