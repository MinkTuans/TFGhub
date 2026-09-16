# Vietnamese interface and complete glyph support

User explicitly requests fonts supporting Vietnamese and all interface text in Vietnamese, with screenshot of inconsistent diacritics in the profile heading. Continue immediately and deploy the verified fix to the already-authorized preview IP.

Design: self-host font files with verified Vietnamese glyph coverage; use a Vietnamese serif for headings and sans-serif for controls/body, preserving the illustrated layout. Translate site-owned labels, headings, help, accessible names, notifications and editor controls. Translate Studio→Xưởng sáng tạo, Scene→Cảnh, game→trò chơi, Email→Thư điện tử where natural. Preserve TFG branding, code/API identifiers, file formats/languages and user-authored content. No database rewrite of titles or code samples.

Work split: root handles typography/font licensing/public pages and integration; agent handles non-editor components; agent handles editor UI and localized enum display without changing serialized values. Update affected test locators precisely. Verify font cmap including decomposed marks, rendered font selection and Vietnamese headings at mobile/desktop; targeted unit tests, lint, production build, browser workflows and final review; deploy web after passing, with backup/rollback and live smoke.

## Verification progress

- Self-hosted Be Vietnam Pro (400/600/700), Lora variable and JetBrains Mono retain full upstream glyph sets and OFL licenses. FontTools verified 150 Vietnamese NFC/NFD characters in every WOFF2 file. Chrome confirms custom Lora renders the reported profile heading in both normalizations; no system fallback or Google Fonts requests.
- Public/account/catalog/profile/Studio/moderation/recovery workflows: 54 unique production-browser cases passed (53 in the broad run, one rerun after updating the obsolete Email assertion). Mobile/desktop screenshots archived at `/tmp/tfg-vietnamese-browser-evidence`.
- Focused unit coverage passed for public routes (62), non-editor components (112), and editor suites (180 before final review). Follow-up default-generation checks covered 102 unique tests, including three new red/green regressions; three existing cases timed out under concurrent browser/lint load and passed unchanged in isolated reruns. Counts overlap and must not be summed.
- Initial production build passed. Full lint has zero errors and the existing hierarchy aria-description warning. Final follow-up lint, real API/ENGINE checks and deployment build recorded in the delivery report.
- Independent review found and resolved new-component English defaults, missing nested field labels and build-reference wording. Final default-generation review found no blockers; canonical values and existing user content are preserved.

Completed: 2/2 real API/ENGINE checks, final Docker build and live smoke passed. Application commit `016e9e9` deployed to the authorized IP. See `docs/11-history/reports/2026-09-16-vietnamese-interface.md` for rollback, backup and live evidence. No further deployment or scheduled work is needed for this request.
