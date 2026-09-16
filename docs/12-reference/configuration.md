# Configuration reference

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API/migrations | PostgreSQL connection |
| `JWT_SECRET` | API | HS256 session and capability signing |
| `API_PORT` | API | Listener port, default `3001` |
| `WEB_ORIGIN` | API | Exact trusted browser origin and CORS origin |
| `COOKIE_SECURE` | API | Secure-cookie override; keep true for HTTPS |
| `GAME_STORAGE_ROOT` | API | Root for artifacts, covers, project assets, thumbnails |
| `GAME_UPLOAD_MAX_BYTES` | API | Legacy ZIP upload bound; production uses 25 MiB |
| `NEXT_PUBLIC_API_URL` | Web build/browser | Public API base, `/api` in production |
| `API_INTERNAL_URL` | Web server | Private SSR API base |
| `DEPLOY_ADDRESS` | Caddy | Hostname or address served by proxy |
| `HTTP_PORT` | Compose | Optional host HTTP port |
| `POSTGRES_DB/USER/PASSWORD` | Compose | Production PostgreSQL bootstrap |
| `NEXT_PUBLIC_ADSENSE_*` | Web build | Optional guarded ad configuration |

Local defaults are documented in `.env.example`; production-required keys are in `.env.production.example`. Do not assume Next loads the repository root `.env` into every package. Never commit populated environment files.

Testing also uses opt-in variables documented by the corresponding scripts, including external-service Playwright settings and dedicated database integration URLs. Read the script before setting them.
