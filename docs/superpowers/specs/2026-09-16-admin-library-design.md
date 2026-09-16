# Admin information and document library

User approved full administrator CRUD after the proposed admin information/document section. The starting files are the project's existing Markdown knowledge base. The feature is an ADMIN-only library, separate from game moderation.

## Behavior

`/admin` redirects to `/admin/library`; navigation exposes “Quản trị website” only to ADMIN. The library groups documents into named categories, with category create/edit/delete and document create/read/edit/delete, search, pagination and a formatted Markdown reader/editor preview. Existing docs are imported once into PostgreSQL. Browser edits change library records, not executable source files; deployments neither overwrite edited records nor resurrect deletions. The web library is the operational editable copy; sourcePath is read-only provenance.

Category fields: id, name (1–100), description (0–500), version, createdAt, updatedAt, documentCount. Document fields: id, categoryId, title (1–200), content (0–200000 characters), sourcePath nullable, version, createdAt, updatedAt. Content is Markdown; raw HTML is never executed. HTTP/HTTPS and safe relative document links only. No arbitrary filesystem reads, file upload or executable configuration editing in this scope.

Categories with documents cannot be deleted until documents are moved or deleted. Document/category save and delete require the current integer version, so concurrent stale changes return 409. UI retains edits on errors and asks before abandoning unsaved edits or deleting a record. All copy is Vietnamese, responsive at 390/1440 and usable at 320px. Reader supports headings, lists, links, tables and code blocks with bounded horizontal scrolling.

## Data and seed

Additive Prisma migration creates AdminLibraryState(id), AdminCategory and AdminDocument; category FK uses RESTRICT. Seed script imports a strictly bounded scan of regular Markdown files under docs/**/*.md, groups by existing topics (superpowers plans/specs into history), creates seed marker `project-docs-v1` transactionally with the records and uses a PostgreSQL advisory lock. Re-running seed does nothing once marked, including after admins edit/delete seeded records. Seed is an explicit deploy script, not an API startup side effect. Repo remains the source for code docs; no automatic overwrite or reverse synchronization.

## API contract

Base `/admin/library`, always JwtAuthGuard + AdminOnlyGuard checking the freshly loaded database role. GET responses private/no-store. Mutation origin protection uses existing configureApp.

- GET /categories -> AdminCategory[]
- POST /categories {name,description} -> AdminCategory (201)
- PATCH /categories/:id {name,description,version} -> AdminCategory
- DELETE /categories/:id {version} -> 204 (409 if nonempty/stale)
- GET /documents?query=&categoryId=&sourcePath=&offset=0&limit=50 -> {items: AdminDocumentSummary[],total:number}; limit 1..100, query max200, offset0..100000; search title/content insensitive; optional sourcePath exact lookup (max500) resolves imported relative Markdown links without filesystem access.
- GET /documents/:id -> AdminDocument
- POST /documents {categoryId,title,content} -> AdminDocument (201)
- PATCH /documents/:id {categoryId,title,content,version} -> AdminDocument
- DELETE /documents/:id {version} -> 204

Unknown IDs 404, invalid input 400, guest401, USER/MODERATOR403. SourcePath immutable and not accepted from client. Zod strict objects in contracts. Transactions enforce version updates and category deletion/FK races. IDs are opaque DB identifiers, not paths.

## Verification/delivery

Contracts and service/HTTP authorization red-green tests; real disposable PostgreSQL migration+CRUD+version/FK/seed-repeat checks; UI red-green controls/errors/unsaved edits; browser CRUD, read formatting/XSS, 390/1440 dark/light and permission checks. Independent review, production builds, backup + rollback tags BEFORE building images, additive production migration, seed once, API/web deployment and non-destructive live smoke. Do not mutate existing user roles or game data for verification.
