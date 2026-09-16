# Phone Discover layout correction — 2026-09-16

Both user screenshots showed Discover on a phone: the search input was right-aligned above its submit button, and fallback cover initials overlapped the card action. Two-column cards also displayed overlong titles and descriptions.

Root causes: globals.css switches search to a column below 47.99rem, while the later illustrated stylesheet aligns that column to its end; the always-visible touch action shares the fallback initials' bottom-right position. The mobile description rule targeted a class absent from GameCard.

The correction is limited to Discover at widths up to 768px in reference-world.css: keep input and button in one row with a shrinking label, put the card action in normal flow below its 16:9 cover, reduce fallback initials, clamp titles to two lines and hide descriptions using their actual class. Desktop rules and application data are unchanged.

## Verification so far

- Original live page reproduced search-row failures at 320/390/430px and three overlapping fallback actions at all tested mobile widths; 320px also clipped all four actions.
- Local CSS preview on real public data passed at 320/390/430/768/1440px in dark and light themes: search row, input width, mobile action containment/separation and no horizontal page overflow. Mobile screenshots inspected.
- Independent CSS/markup review found no blockers in cascade, scope or cover/action placement.
- No new unit tests for presentation-only CSS. Browser evidence/scripts: `/tmp/tfg-phone-fix`.

## Deployment

Pending Docker build, backup and live verification. Do not mark complete until the live browser check passes without CSS injection.
