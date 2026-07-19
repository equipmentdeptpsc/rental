# Local Digital DEUR synchronization server

This is a local-development-only Node service. It is separate from the Vite browser application and is not production-ready.

Set the `DEUR_SYNC_*` variables shown in `.env.server.example`, then run `npm run server:start`. The PostgreSQL schema must already exist unless `DEUR_SYNC_RUN_MIGRATIONS=true` is explicitly set.

The server binds to `127.0.0.1:8787` by default and exposes `POST /deur-sync/push`, `POST /deur-sync/pull`, `GET /health`, and `GET /ready`. It does not provide authentication, authorization, tenant isolation, CORS configuration, or deployment integration.
