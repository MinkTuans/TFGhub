# Vietnamese interface and font correction — 2026-09-16

The user reported inconsistent Vietnamese diacritics in the profile heading and requested Vietnamese throughout the interface. This change preserves the illustrated navy/gold design while replacing system typography with bundled, licensed fonts: Be Vietnam Pro for UI text, Lora for headings, JetBrains Mono for code textareas.

Site-owned navigation, public pages, account forms, creation/management, moderation, editor panels, field/enum labels, feedback and generated starting text are Vietnamese. Display labels retain explicit canonical option values. Existing user-created names, descriptions, code and stored content are preserved. English registry defaults are localized only when creating new components or explicitly resetting their properties.

## Verification

- All five WOFF2 files contain the 150 tested Vietnamese precomposed/decomposed characters, including combining marks. Full upstream glyph sets and SIL OFL notices are included.
- Chrome reports custom Lora for both NFC and NFD forms of “Chỉnh sửa hồ sơ”. Bundled font requests are same-origin; no Google Fonts requests.
- 54 unique production-browser cases passed across account flows, catalog, player, profile, management, moderation, error/loading recovery and font checks. One obsolete Email assertion was updated and its full account flow rerun successfully. Evidence: `/tmp/tfg-vietnamese-browser-evidence`, `/tmp/tfg-vietnamese-recheck-browser`.
- Focused public-route unit tests: 62 passing; non-editor component tests: 112 passing; editor verification: 180 before final review, plus 102 in the overlapping follow-up group. Do not sum overlapping groups. New default-generation regressions verified red/green. Three existing hierarchy cases exceeded the 5-second limit under concurrent browser/lint load and passed unchanged when rerun separately.
- Initial production build passed. Full lint: zero errors, one pre-existing hierarchy aria-description warning. Follow-up changed-file lint passed.
- Real API/ENGINE browser checks: 2/2 passed on disposable PostgreSQL, including desktop scene/title persistence and mobile metadata saving. The stack cleaned itself up; no production fixtures were created.
- Independent final review found no blockers in localized default generation, preservation of existing records and canonical field values.

## Deployment

Final real-API checks and deployment evidence will be added after execution.
