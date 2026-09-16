# Game engagement and creator analytics

## Intent and scope
Implement the user's three-part basic-platform brief: real plays/active playtime, 1–5 ratings, comments, game-submitted high score, owner-only analytics and role-appropriate Vietnamese mobile/desktop UI. Reuse moderation and publishing; no fake metrics or earnings. Favorites, ranked leaderboard, transactions, report queues, screenshot-upload subsystem and category taxonomy are later work; never invent media/genres. Existing cover is real media. Share uses native share/copy, no counter. Browser platform is factual. Existing review date may be labelled approval date, never fabricated release date.

## Domain
New additive GamePlay, GameRating, GameComment, GameScore models; Game.scoresEnabled default false. All belong to Game with cascade delete (consistent with deleting game without retained publishing history). Ratings/comments associate active user, cascade on user deletion; plays user nullable SetNull, use hashed participant key (no raw IP or anonymous cookie exposed); scores belong to play (one maximum per play), nullable user if needed. DB check rating1..5, duration>=0, boundedscore, unique rating(user,game) and score(play). Existing imported totals remain zero; metadata does not imply historical activity.

Play = successful explicit launch of playable approved/public/clear game, not opening detail. Start is idempotent by request UUID per participant; same participant/game starts within30seconds reuse latest session to avoid double clicks. Guest cookie HTTP-only SameSiteLax Secure per env, random, HMAC before storage; signed-in key derives userID. Optional auth must reject invalid/inactive presented auth; AUTH_REQUIRED requires login. No preview/moderator test-play counts. Session bearer random token stored hash, scoped to game; never public DTO. Expire after6hours. Active heartbeat delta integer0..30seconds plus monotonically increasing sequence. Atomic updates reject/reuse duplicate/older sequences and cap credited time by elapsed server time since previous heartbeat, never accumulate hidden-tab gaps; client discards hidden time. Start totals do not require a heartbeat. Stats average = sum credited seconds / accepted plays (zero durations included), null when none. Unique players = distinct pseudonymous account/browser keys, explicitly labelled estimate.

Score enabled only by owner/admin setting. Accept finite nonnegative integer <=2147483647 via a valid play token; retain max perplay, reject disabled/private/quarantined/expired session. Game iframe posts {type:"tfg:score",score:number}; parent validates exact iframe contentWindow and payload, never relax sandbox allow-scripts allow-pointer-lock. Client-reported scores are not anti-cheat verified; show label/help and do not imply verified competition. No leaderboard now.

Ratings: login required; one peruser/game, PUT upsert1..5, DELETE own. Public aggregate counts perstar1..5 and mean, zero-state no invented4.6. Comments: plain text1..2000, paginated20, newest first deterministicid; logged-in create, own delete, moderator/admin delete inappropriate comments. Rate limit new comments peruser/game30seconds; server conflict returns bounded error. No replies. Public author DTO only id/displayName, neveremail. Display commenter current rating if any. Public comments require public eligible game; private review comments accessible to owner/mod/admin by gameID; mutations preserve authorization after hide/lock. Private creator analytics only owner or ADMIN (moderator not automatically allowed).

## Stable transport contract (packages/contracts/src/game-engagement.ts)
Export types EngagementStats={totalPlays:number,uniquePlayers:number,averagePlaySeconds:number|null,ratingAverage:number|null,ratingCount:number,ratingDistribution:{stars:number,count:number}[],commentCount:number,highScore:number|null,scoresEnabled:boolean}; EngagementComment={id:string,body:string,createdAt:string,author:{id:string,displayName:string},rating:number|null}; EngagementComments={items:EngagementComment[],total:number}; GameAnalytics={game:{id:string,title:string,slug:string,reviewState:string},stats:EngagementStats,dailyPlays:{date:string,plays:number}[],trackingStartedAt:string|null}; PlaySession={playId:string,token:string,scoresEnabled:boolean}; EngagementViewer={rating:number|null}. Schemas for inputs strict and bounded.

Routes (API prefix omitted):
- GET /engagement/games/:slug/stats -> EngagementStats (public eligible game)
- GET /engagement/games/:slug/comments?offset=0&limit=20 -> EngagementComments (public)
- GET /engagement/games/:slug/me -> EngagementViewer (JWT)
- PUT /engagement/games/:slug/rating {rating}; DELETE same ->204 (JWT)
- POST /engagement/games/:slug/comments {body} -> EngagementComment (JWT)
- DELETE /engagement/games/:slug/comments/:commentId ->204 (author or MODERATOR/ADMIN; check game scope)
- POST /engagement/games/:slug/plays {requestId:UUID} -> PlaySession (optionalJWT/cookie)
- PATCH /engagement/games/:slug/plays/:playId {token,sequence,activeSeconds} -> {activeSeconds:number} (session capability)
- POST /engagement/games/:slug/plays/:playId/score {token,score} -> {highScore:number} (capability)
- GET /games/:id/analytics -> GameAnalytics (JWT owner/ADMIN), last30 UTCdates includeszeros, trackingStartedAt earliestplay (notfakehistoricaldate)
- PATCH /games/:id/engagement-settings {scoresEnabled:boolean} -> {scoresEnabled:boolean} (JWTowner/ADMIN)
- GET /games/:id/community-comments?offset=0&limit=20 -> EngagementComments (JWTowner/MODERATOR/ADMIN)
- DELETE /games/:id/community-comments/:commentId ->204 (JWTMODERATOR/ADMIN or commentauthor; owner cannotdeleteothers solelyasowner)
All private/capability responses Cache-Control private,no-store. Existing trustedOrigin middleware retained. Query aggregates DB-side, no unbounded record fetch. Per-session rowlock or atomic SQL handles heartbeat/score concurrency. Rate limits and idempotency cannot rely only on process memory. No operational client tokens in logs.

## UI and ownership boundaries
Root owns GamePlayer changes + telemetry helper/tests. Player initially shows playbutton; only explicitclick loadsiframe. On iframe load start accepted play, heartbeat every15seconds while document visible/focused; discard hidden time; sequence handles retries; usefetch keepalive JSON on visibilityhide/pagehide if useful. Telemetry failure never breaksplaying. Validate source before scores; catchmessages prior sessionready safely. No sessionlogging. Pass optional slug from detailpage; no tracking for previews.
Web implementer owns game detail engagement/comments/ratings/share components, analytics route /studio/games/[id]/analytics and links in studio lists/workspaces, moderation community view. Existing GamePlayer props add slug?:string by root; keep page using title/src/viewports. Rating CRUD, comment CRUD, clear loading/error/pagination states, login prompts. Two-column mobile metriccards, chart nativeSVG/CSS with accessible table/labels. Earnings text: “Chưa tích hợp thanh toán” (not fabricated No earningsyet/revenue). No income in public/moderator UI. Keep existing publishingguards.
API implementer owns contracts + migrations + API + focused tests; root integration/docs; reviewer independent when code ready. API sends stabilized contracts before UI builds.

## Verification and rollout
TDD focused contracts/API/UI/telemetry, disposable PG fresh+upgrade, realHTTP auth/unique/conflict/heartbeat/score/moderation tests, actual iframe score/visibility behavior in browser and mobile+desktop light/dark. Production build, retained rollbacktags, consistent DB/artifact backup, additive migration, authorized API/web deployment161.248.81.59, readonly live verification (do not generate realplays/rating/comments just for smoke). Update current docs and report; stop own teststack/remove tokens. Existing tasks complete; no replay of olddeployments.
