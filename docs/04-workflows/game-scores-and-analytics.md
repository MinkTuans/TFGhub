# Game activity, scores and analytics

Status: deployed; see the [rollout report](../11-history/reports/2026-09-16-game-engagement.md).

## What is counted

A play begins when a player explicitly launches a publicly approved, ready game and the platform accepts the start request. Opening a detail page or a Studio/moderator preview does not count. Repeated starts from the same account/browser within 30 seconds reuse a session. Existing games begin with zero collected activity; the platform does not invent historical totals.

Active playtime records foreground, focused time in bounded heartbeats. It is an estimate, excludes background tabs, and may undercount during network loss or browser shutdown. Average time divides recorded active seconds by accepted plays, including plays that have no credited time. Unique players count distinct signed-in accounts or anonymous browser identifiers, not verified human beings; clearing cookies, switching browsers or signing in can change that estimate.

Creator Analytics shows aggregate activity and 30 UTC calendar days. Only the owner and an administrator may access it. A moderator does not receive creator analytics through their moderation role. Payments are not integrated; no revenue number is shown.

## Submit a score from a game

The creator must first enable score collection in the game's Analytics page. The game itself decides the score. From JavaScript running inside the game iframe:

```js
window.parent.postMessage({ type: 'tfg:score', score: 8420 }, '*');
```

The wildcard supports deployment under different parent origins; this message contains only a non-secret score. The platform checks that the message comes from the exact active game iframe. It does not grant the iframe same-origin privileges or expose the play token to game code.

`score` must be an integer from 0 to 2,147,483,647. The platform retains the highest score per play and shows the game's maximum only while score collection is enabled. Messages are coalesced. Sessions expire after six hours; unavailable/quarantined games and disabled accounts cannot continue submitting activity.

Scores are client/game reported, not verified against cheating. They must not be treated as trusted evidence for payments or prizes. No ranked leaderboard is included in this release. Games without scoring should leave the setting disabled; they show no invented score.

## Ratings and comments

Signed-in active users may set or replace one 1–5 star rating per game and remove their rating. Public averages and distributions use stored ratings. Comments are plain text with no replies; authors can delete their own, moderators/admins can remove inappropriate comments. A creator does not gain deletion rights over another person's comment solely by owning the game. New comments have a 30-second per-user/game cooldown that deletion does not reset.
