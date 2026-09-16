# Daylight theme correction

User requests the existing illustrated harbor in daytime, with matching light-theme details. Keep the current composition, Vietnamese typography, navigation and dark/default artwork. Add a separate generated daylight asset; replace the light theme's 30%-opacity night image with that image at full opacity. Use a subtle localized text scrim, warm ivory surfaces, marine accents and appropriate header, footer, mobile dock, cards and player surround. Preserve editor canvas styling and game content.

Verify actual artwork switching/persistence, readable light-theme UI, desktop/mobile screenshots, existing catalog/account/profile/Studio/moderation/player layout checks. Build, commit and deploy the web service within existing authorization, with backup/rollback and live smoke. No database or API changes.

Completed: browser checks, independent review, production build and live smoke passed. App commit `fc51609` deployed; evidence in `docs/11-history/reports/2026-09-16-daylight-theme.md`. No remaining work or repeated deployment required.
