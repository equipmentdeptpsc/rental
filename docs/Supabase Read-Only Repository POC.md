# Supabase Read-Only Repository POC

Equipment Status is the first remote proof of concept because it is universal, non-sensitive reference data with four stable rows and no transactional ownership. Local Storage remains authoritative and default.

## Configuration

```dotenv
VITE_EQUIPMENT_STATUS_SOURCE=local
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_SAFE_KEY
```

Only the exact value `supabase` enables remote reads. Existing or partially configured Supabase variables do not switch sources. Missing URL/key in explicitly selected remote mode produces a structured feature error and retry UI. To disable immediately, set `VITE_EQUIPMENT_STATUS_SOURCE=local` or remove the flag and rebuild/restart.

The singleton client disables session persistence/refresh because authentication is not part of this proof of concept. Feature code receives a read-only repository through the composition root and never imports the client. The repository selects only `id, code, name, description, active, deleted_at, sort_order`, orders by `sort_order` then `code`, validates rows, maps to the existing domain type, clones results, accepts cancellation, and returns structured errors.

Remote mode never falls back silently and never writes to Local Storage. Existing management calls are rejected at provider level as read-only. Loading, empty, loaded, error, and retry states are explicit; request sequence and abort controllers prevent stale/unmounted updates.

## RLS boundary

Option A was selected temporarily because Equipment Status is non-sensitive universal reference data. Migration 008 enables RLS, grants anonymous column-level SELECT only, and creates a non-deleted-row SELECT policy. Browser writes receive `42501`. Other ERP tables receive `42501`. Migrations 009–010 conditionally configure and reload Supabase/PostgREST so ordinary PostgreSQL safely skips those platform-specific operations.

Hosted parity: four rows in stable order—Available, Assigned, Rented, Maintenance—with canonical IDs/codes, active=true, and sort orders 10/20/30/40. No source is overwritten.

Before any Customer or Equipment remote repository, authentication, approved tenancy ownership, table-specific RLS, server transaction boundaries, asynchronous Context design, and backup/restore readiness are required.

## Shared Remote Core

Phase 11C moved provider-neutral behavior into `src/core/remote`. Equipment Status now supplies only its explicit Supabase query, deterministic domain ordering, and Equipment Status row mapping. The composition root injects the shared core and singleton client. Errors, safe-read retries, cancellation, paging/ordering options, capabilities, redacted logs, configuration validation, and timing metrics must not be reimplemented by later repositories.
