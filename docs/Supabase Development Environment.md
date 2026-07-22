# Supabase Development Environment

Phase 11A validated dedicated project `equipment-rental-system-dev` (`xvdnkslfmffsufipcout`) in `ap-northeast-2`. The application remains on Local Storage; no Supabase client or runtime credential exists in frontend code.

Hosted PostgreSQL is 17.6 (`17.6.1.147` platform build), UTF8, UTC, with ICU `en-US` locale and `en_US.UTF-8` collation/ctype. Installed extensions were `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, and `uuid-ossp`. The project exposes platform-managed `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `realtime`, `storage`, `supabase_migrations`, and `vault` schemas alongside `public` and application-owned `erp`. Platform schemas were not modified.

The local Phase 10 engine was PostgreSQL 17.10, Windows, C locale, Asia/Kuala_Lumpur timezone, and only `plpgsql`. Material differences are patch version, operating system/compiler, UTC server default, ICU locale, installed platform extensions, managed roles/schemas, and Supavisor pooling. Application timestamps use `timestamptz`, explicit business dates, and explicit schema search paths, so these differences did not change validation results.

Migrations 001–007 applied successfully through CLI 2.109.1. The hosted catalog contains 42 ERP tables, 6 enums, 94 indexes, 19 application triggers, and 3 application functions; seeds contain 4 Equipment statuses and 8 Rental statuses. Catalog, constraints, deliberate rollback, synthetic import, persisted billing/hash verification, and clean/inconsistent reconciliation passed. The CLI emitted a non-fatal warning that it could not cache the pg-delta catalog without Docker after the successful push; migration history still aligned all seven local and remote versions.

Available connection choices are direct PostgreSQL where network routing permits, Supavisor session pooling on port 5432 for session-oriented tools, and transaction pooling on port 6543 for short stateless operations. Migrations and transaction-heavy trusted commands should use direct or session mode, never transaction pooling when session state is required.

## Backup and recovery assessment

The provider reports WAL-G physical backup support enabled, PITR disabled, and no available backup yet for this new project. No paid recovery feature was enabled. Supabase documents automatic daily backups for Pro/Team/Enterprise projects and separately priced PITR; free projects should maintain logical exports. The CLI schema-dump plan was inspected, but CLI 2.109.1 prints its temporary login credential during `db dump --dry-run`, so that output must not be retained. An actual ignored schema dump was attempted and blocked because this CLI path requires Docker. Phase 10C already proved ordinary PostgreSQL `pg_dump`/`pg_restore`; hosted restore equivalence remains unproven.

Project reset is destructive and should be used only for this dedicated environment after retaining canonical migrations and an approved export. A production recovery plan must define provider plan, backup retention, PITR/RPO/RTO, Storage-object backup (database backups retain Storage metadata but not deleted bucket objects), and restore rehearsal into a separate project.

## Tenancy recommendation

Current evidence supports option A: one company/organizational boundary. Customers are business records rather than system tenants, and Affiliate/Non-Affiliate is commercial transaction metadata. Operators may receive restricted application access later but do not establish tenancy. Do not add `tenant_id` speculatively now. Before production data exists, stakeholders must explicitly decide whether affiliates will operate independent books, users, equipment, and audit boundaries. If yes, choose option B and add mandatory tenant ownership before import; option C requires a separate isolation architecture and is not justified by the current application.
