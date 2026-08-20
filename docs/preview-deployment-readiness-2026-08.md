# Preview Deployment Readiness — 2026-08

Audit date: 2026-08-20

Release candidate: `release-candidate-mvp-2026-08` at `7211efe`

Intended scope: Git-connected frontend preview plus the isolated Supabase and Cloudflare UAT services required for operational workflow verification.

## Readiness decision

**Not ready to deploy a full operational preview.**

The frontend source is buildable: repository-local TypeScript verification and the Vite production build passed, transforming 1,401 modules into `dist`. The Git-connected deployment path, host routing, isolated environment configuration, Supabase migration state, and Worker secrets are not yet ready or independently verified.

A static root-page preview is technically buildable. It must not be treated as an operational UAT preview until every Critical and High blocker below is closed.

## Configuration audit

### Netlify configuration

`netlify.toml` contains:

```toml
[build]
  command = "npm run verify"
  publish = "dist"
```

Findings:

- The publish directory matches Vite's default `dist` output.
- `npm run verify` runs the full Vitest suite, test TypeScript checking, application TypeScript build, and Vite production build.
- No Netlify site linkage exists in the working copy; `.netlify` is absent.
- No branch/context-specific environment configuration is declared.
- No SPA fallback exists in `netlify.toml` or `public/_redirects`. Because the application uses `createBrowserRouter`, direct requests to application and public-review routes will not reliably resolve to `index.html`.
- `public/_headers` configures caching only. It does not define security headers.

### Vite build configuration

- Vite uses React and Tailwind plugins plus the `@` alias to `src`.
- No non-default `base` is configured; deployment therefore assumes a root-domain path.
- Vite 8.1.2 requires Node `^20.19.0` or `>=22.12.0`.
- `package.json` does not pin `engines.node` or `packageManager`, and Netlify does not declare `NODE_VERSION`.
- The production build passes, but emits non-blocking warnings for chunks over 500 kB. The largest generated JavaScript chunk is approximately 1.68 MB before gzip.
- `VITE_APP_VERSION` is displayed in the UI but is not documented in `.env.example` or populated by the repository configuration; previews will display `development` unless the host supplies it.

### Build commands

| Target | Command | Audit result |
| --- | --- | --- |
| Netlify | `npm run verify` | Correct in principle; cannot run on this workstation because the global npm shim points to a missing npm CLI module. |
| Tests | `vitest run` | Previously passed: 1,638 tests passed, 139 skipped, 0 failed. |
| Test TypeScript | `tsc --noEmit -p tsconfig.test.json` | Passed with repository-local binary. |
| Application build | `tsc -b && vite build` | Passed with repository-local binaries; 1,401 modules transformed. |
| Server TypeScript | `tsc --noEmit -p tsconfig.server.json` | Previously passed. Not invoked by Netlify's build. |
| Worker TypeScript | `tsc --noEmit -p tsconfig.worker.json` | Previously passed. Not invoked by Netlify's build. |
| Worker package check | `wrangler deploy --env uat --dry-run` | A prior dry run packaged successfully, but the current build script omits `--env uat`. |

Netlify normally installs dependencies in its own environment, so the workstation npm failure does not prove that Netlify will fail. A clean Netlify build log is still required.

### Environment variables

Browser-visible Vite variables for a remote preview:

| Variable | Required value or rule |
| --- | --- |
| `VITE_PERSISTENCE_MODE` | `remote` for isolated Supabase preview; `local` only for a non-operational UI preview. |
| `VITE_EQUIPMENT_STATUS_SOURCE` | `supabase` when independently selecting remote Equipment Status; otherwise align with persistence mode. |
| `VITE_SUPABASE_URL` | Credential-free HTTPS URL for the isolated UAT Supabase project. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable/anon key only. Never use a service-role key. |
| `VITE_REMOTE_OPERATIONAL_WRITES_ENABLED` | Keep `false` for initial preview. Change only for a separately authorized operational-UAT build. |
| `VITE_OPERATIONAL_READ_TRANSPORT` | Set explicitly to `realtime-with-polling-recovery` when certifying realtime; otherwise polling is selected. This variable is currently undocumented in `.env.example`. |
| `VITE_APP_VERSION` | Set to the immutable candidate commit/build identifier. |

Build/test safety variables:

| Variable | Preview build requirement |
| --- | --- |
| `RUN_SUPABASE_INTEGRATION_TESTS` | Must be absent or `false` during ordinary Netlify builds. |
| `ALLOW_SUPABASE_TEST_MUTATION` | Must be absent or `false` during ordinary Netlify builds. |
| `SUPABASE_TEST_*` | Must not be copied into frontend deploy contexts. Use only in a separately authorized integration-test job. |

The ignored local `.env.local` currently enables Supabase integration tests and mutation authorization. It is not tracked and must never be uploaded or bulk-copied into Netlify, GitHub, or Cloudflare environments.

### Supabase environment usage

- The browser application uses the URL and publishable key for authentication, remote reads, public reviews, DEUR commands, Assignment/Rental commands, and operational event transport.
- The service-role key is server/Worker-only and must never use a `VITE_` prefix.
- Remote operational commands fail closed when their build-time write flag is disabled.
- Public Customer, grouped Customer, and Manager review pages require browser-safe Supabase configuration even if other features run locally.
- The release contains 84 ordered Supabase migrations. The audit did not verify that an isolated preview project exists, that all migrations have been applied in order, or that the migration head and seed identities match the release candidate.
- Supabase CLI credentials such as `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_REF` are migration/deployment credentials, not frontend variables.

### Cloudflare Worker configuration

- `wrangler.jsonc` defines a top-level production Worker named `psc-ed` and an isolated `uat` Worker named `psc-ed-uat`.
- The Worker serves the SPA assets from `dist` with single-page-application fallback.
- The UAT configuration includes a credential-free Supabase URL, public review origin, sender address, cron selectors, and batch limits of one.
- The UAT Cron Trigger list is intentionally empty. Scheduled notifications will not run automatically.
- Deployment must always specify `--env uat`; omitting it targets the top-level Worker and is unsafe.
- The configured public review origin is the Cloudflare UAT Worker URL. If Netlify is selected as the canonical preview frontend, this origin must be reconciled so generated review links reach the intended host.

Required Cloudflare secrets for `uat`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1` — canonical base64 encoding of exactly 32 bytes

Required Worker configuration also includes `SUPABASE_PUBLISHABLE_KEY`; it is browser-safe but is not currently present under `env.uat.vars` and must be provisioned as an environment-scoped variable or secret.

Optional UAT delivery control:

- `EMAIL_UAT_RECIPIENT_OVERRIDE`

No Cron Trigger should be enabled until separately authorized because the Worker documentation records prior unknown-outcome delivery attempts.

### GitHub integration requirements

- No `.github/workflows` files exist, so the repository does not provide GitHub Actions build, test, preview, or deployment checks.
- The local release-candidate branch has no upstream tracking branch.
- A read-only remote query confirmed that `company/release-candidate-mvp-2026-08` does not exist.
- The local GitHub CLI account is configured with an invalid token.
- Netlify GitHub App/OAuth installation and repository access cannot be inferred from repository files and were not verifiable from the current environment.

A Git-connected Netlify preview requires the branch on the canonical remote plus an authorized Netlify repository connection. A GitHub Actions deployment would additionally require a reviewed workflow and scoped host credentials; none exists today.

### Deployment secrets

| Scope | Secrets or credentials | Handling requirement |
| --- | --- | --- |
| Netlify frontend | Normally none beyond browser-safe `VITE_*` values | Store per deploy context; never place service keys in `VITE_*`. |
| Supabase migrations | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, project reference | Use only in an approved migration job or secured operator session. |
| Cloudflare deployment | Cloudflare API token and account access | Scope to the UAT Worker/account and keep outside tracked files. |
| Cloudflare runtime | Supabase service-role key, Resend API key, grouped-review encryption key | Install with environment-scoped Worker secret bindings for `uat`. |
| GitHub/Netlify integration | GitHub App authorization or valid scoped token | Grant only the canonical repository and required checks/deployment access. |

No actual secret values were read into this report. Tracked files contain placeholders and non-secret endpoints only.

## Blockers

### Critical

1. **Release-candidate branch is absent from the canonical remote.** A Git-connected preview cannot select or build the audited commit.
2. **Isolated Supabase preview state is unverified.** The 84-migration head, seed users, tenant isolation, RLS/RPC contracts, and cleanup boundary must be confirmed before a remote-mode preview is considered operational.
3. **Build mutation variables need an explicit safe policy.** `RUN_SUPABASE_INTEGRATION_TESTS` and `ALLOW_SUPABASE_TEST_MUTATION` must be absent or false in ordinary preview builds. Copying the local environment wholesale could execute mutation-enabled integration tests against configured infrastructure.
4. **Required Worker runtime secrets are not verified in the `uat` environment.** Scheduled/review delivery composition fails closed without the service-role key, encryption key, publishable key, and—when retry delivery runs—Resend key.

### High

1. **Netlify SPA fallback is missing.** Deep links, refreshes, and public review URLs can return host-level 404 responses.
2. **GitHub/Netlify integration is not ready.** There is no remote candidate branch, no checked-in CI workflow, no verified Netlify repository connection, and the local GitHub token is invalid.
3. **Preview topology is ambiguous.** Netlify and Cloudflare can both serve the SPA, while `REVIEW_PUBLIC_BASE_URL` currently targets Cloudflare. One canonical preview origin must be selected.
4. **Node and package-manager versions are unpinned.** The host must use Node 20.19+ or 22.12+ for Vite 8.
5. **Operational-write enablement is intentionally blocked.** The initial preview should remain read-only; a separate approved build is required for cross-device mutation UAT.
6. **No clean-host build evidence exists.** The equivalent local build passes, but the exact Netlify command has not passed in a Netlify environment.

### Medium

1. Server and Worker type checks are not part of `npm run verify`; a frontend preview can pass while those deployment units regress.
2. `VITE_OPERATIONAL_READ_TRANSPORT` is used but not documented in `.env.example`.
3. The Netlify configuration has no security headers such as CSP, frame protections, referrer policy, or permissions policy.
4. Cloudflare UAT Cron Triggers are empty. This is safe by default but prevents scheduled-flow preview testing.
5. Repository-wide lint is not part of the deploy command and is known to have a large pre-existing failure baseline.
6. The full test suite runs during every Netlify build, increasing preview latency and timeout exposure.

### Low

1. `VITE_APP_VERSION` is not configured, reducing traceability in the UI.
2. Large frontend chunks may slow first load on mobile or constrained UAT networks.
3. There is no local Netlify site metadata, making CLI-based status inspection unavailable until the site is linked.
4. Cache headers are present, but their behavior still needs verification on the actual preview host.

## Exact actions required for preview deployment

### Phase 1 — Select and secure the preview topology

1. Choose the canonical frontend origin:
   - Recommended split: Netlify for the frontend preview and Cloudflare `psc-ed-uat` for scheduled/review Worker services; or
   - Cloudflare-only preview using the Worker asset binding.
2. Record the chosen frontend origin and align `REVIEW_PUBLIC_BASE_URL` with the host that serves the public review routes.
3. Confirm the target Supabase project is isolated UAT, contains no production markers, and uses a `TENANT-UAT-*` fixture boundary.

### Phase 2 — Prepare GitHub and Netlify

1. Re-authenticate GitHub with a least-privilege credential or approved GitHub App.
2. Push `release-candidate-mvp-2026-08` to the canonical `company` remote only after explicit push authorization.
3. Install or verify the Netlify GitHub App for `equipmentdeptpsc/rental` and permit preview builds for the release-candidate branch.
4. Configure the Netlify base directory as the repository root, build command as `npm run verify`, and publish directory as `dist`.
5. Configure Node `22.12.0` or newer in the Netlify build environment.
6. Add a Netlify SPA rewrite equivalent to `/*  /index.html  200`, then verify direct navigation to every protected and public route.

### Phase 3 — Configure safe frontend variables

1. Set `VITE_PERSISTENCE_MODE=remote`.
2. Set `VITE_EQUIPMENT_STATUS_SOURCE=supabase` if Equipment Status should be remote.
3. Set isolated-UAT `VITE_SUPABASE_URL` and browser-safe `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Set `VITE_REMOTE_OPERATIONAL_WRITES_ENABLED=false` for the initial preview.
5. Set `VITE_OPERATIONAL_READ_TRANSPORT=realtime-with-polling-recovery` only when that transport is intended for certification.
6. Set `VITE_APP_VERSION` to the full release-candidate commit SHA or immutable build ID.
7. Explicitly set `RUN_SUPABASE_INTEGRATION_TESTS=false` and `ALLOW_SUPABASE_TEST_MUTATION=false`, or leave them absent.
8. Do not configure service-role, database password, Resend, encryption, or test service keys as `VITE_*` variables.

### Phase 4 — Prepare isolated Supabase

1. Take and verify a pre-deployment backup or disposable-project reset point.
2. Verify the exact project reference and environment identifier are nonproduction.
3. Apply all 84 migrations in filename order without editing or skipping immutable files.
4. Run schema, RLS, RPC, permission-catalog, idempotency, and migration checksum validation.
5. Provision controlled UAT users, Operator links, tenant, Equipment, Assignment, Rental, DEUR, and Billing fixtures.
6. Record baseline counts and approved cleanup identifiers before enabling any mutation test.

### Phase 5 — Configure and validate Cloudflare UAT

1. Authenticate Wrangler with a Cloudflare token scoped to the UAT account and Worker.
2. Install environment-scoped secrets without writing them to files:

```text
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env uat
npx wrangler secret put RESEND_API_KEY --env uat
npx wrangler secret put GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1 --env uat
```

3. Provision `SUPABASE_PUBLISHABLE_KEY` for `env.uat` as a browser-safe scoped binding.
4. Set or verify the authorized `EMAIL_UAT_RECIPIENT_OVERRIDE` when real-email UAT is in scope.
5. Run `npm run build`, `npm run typecheck:worker`, and `npx wrangler deploy --env uat --dry-run`.
6. Confirm the dry-run identifies `psc-ed-uat`, never the top-level `psc-ed` Worker.
7. Keep Cron Triggers empty unless a separate notification-run authorization is granted.

### Phase 6 — Create and verify the preview

1. Trigger one preview deployment for the immutable candidate SHA; do not deploy from an uncommitted working tree.
2. Capture the preview URL, deploy/build ID, commit SHA, Node/npm versions, environment name, and artifact digest.
3. Confirm the build log shows tests, test TypeScript, application TypeScript, and Vite build passing.
4. Smoke-test root navigation and direct/refreshed routes: login, Dashboard, Equipment, Assignments, Rentals, Rental Workspace, Operator, Billing, Return, Close, Customer review, grouped Customer review, and Manager review.
5. Verify authentication, permissions, tenant isolation, Supabase connectivity, realtime/polling behavior, browser console, network failures, cache headers, and Worker logs.
6. Confirm remote operational writes are still disabled in the initial preview.
7. Only after separate authorization, create a controlled write-enabled build and execute the isolated cross-device UAT runbook.
8. Run cleanup twice, require zero removals on the second pass, restore write flags, and audit database/browser/queue/subscription residue.

## Final gate

Preview readiness is **CONDITIONAL** for a static frontend and **NO** for a full operational UAT preview. Close all Critical blockers, the SPA/GitHub/topology/Node High blockers, and the applicable Cloudflare/Supabase gates before deployment authorization is requested.
