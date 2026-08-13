# Grouped review scheduled Worker

This Worker preserves the existing SPA asset binding and contains an internal `scheduled()` handler. No Cron Trigger is configured in this phase.

Future UAT and production deployments must use separate Cloudflare environments and separately provisioned bindings. Production must never reuse UAT values.

Secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1`

Non-secret configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (browser-safe public-review RPC client; UAT project only)
- `EMAIL_UAT_RECIPIENT_OVERRIDE` (explicitly authorized non-secret UAT-only provider destination constraint; never business recipient authority)
- `REVIEW_PUBLIC_BASE_URL`
- `RESEND_FROM_ADDRESS`
- `SCHEDULER_JOB_CRON`
- `NOTIFICATION_JOB_CRON`
- `NOTIFICATION_WORKER_BATCH_LIMIT` (1–50; defaults to 10)
- `SCHEDULER_BATCH_LIMIT` (1–100; defaults to 25)

Secret values must be installed later with environment-scoped `wrangler secret put` commands. Do not put secret values in `wrangler.jsonc`, `VITE_*` variables, or tracked environment files. Production requires a distinct production envelope key.

The isolated `uat` environment deploys as the separate `psc-ed-uat` Worker with both batch limits set to 1. Its Cron list is intentionally empty. The grouped-review public-client boundary and the Worker-safe Resend fetch transport are provider-free certified. C12.2.7E.2 still has two prior unknown-outcome attempts with no provider message IDs, so restore Job A (`*/15 * * * *`) and Job B (`*/2 * * * *`) only under fresh explicit authorization for one new logical notification. The top-level `psc-ed` production/public Worker has no Cron configuration; never deploy UAT bindings without `--env uat`.

## UAT operations

Use Cloudflare Worker logs as the initial monitoring surface. Alert as **critical** when required configuration cannot load, encryption-key validation fails, or either scheduled job repeatedly fails. Alert as **warning** when scheduler group failures, notification retries/backlog, invalid tenant timezone/configuration, missing scheduler principals, or expired scheduler claims recur. Metrics and alerts must contain aggregate counts only—never customer identity, recipient, review URL, credential, envelope ciphertext, nonce, authentication tag, or provider body. Alert delivery needs a separately approved destination and is not provisioned by this repository.

Track notification intents eligible for delivery, oldest eligible age, retryable failure count, and expired `CLAIMED` scheduler groups (`claim_expires_at < clock_timestamp()`). Compare scheduler duration to the ten-minute claim lease; do not repair normally reclaimable expired claims manually. For provider-accepted/response-lost uncertainty, reconcile the canonical notification, its stable provider idempotency key, delivery-attempt history, and provider message identity/readback before any operator retry.

The tenant kill switch is `automation_enabled=false` through the canonical scheduler configuration command. For an infrastructure-wide UAT stop, remove only `env.uat.triggers.crons` and deploy with `--env uat`; preserve historical batches, requests, attempts, scheduler principals, and DEUR evidence. Production rollback and production activation are separate, explicitly gated operations.

Rotate the Supabase service-role and Resend secrets by updating their Cloudflare secret bindings and redeploying/revalidating UAT. Encryption-key rotation is version-aware: never overwrite V1 while an active V1 envelope exists; introduce a new key version, retain V1 for existing envelopes, then retire it only after all V1 envelopes are terminal.
