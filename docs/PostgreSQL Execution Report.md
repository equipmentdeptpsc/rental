# PostgreSQL Execution Report

## Environment

- Engine: PostgreSQL 17.10, EDB Windows x86-64 portable binaries.
- Runtime: workspace-local disposable cluster, loopback `127.0.0.1:55432`; no Windows service.
- Databases: `phase10c_a`, `phase10c_b`, and restore target `phase10c_restore`.
- Encoding/locale/timezone: UTF8, C collation and ctype, Asia/Kuala_Lumpur server timezone.
- Installed extensions: `plpgsql` 1.0 only. The schema requires no optional extension.
- Compatibility: PostgreSQL 17 matches the current Supabase platform/self-hosted default major version. A future project must still verify its exact `select version()` result.

## Execution

All migrations used `psql -X -v ON_ERROR_STOP=1` and completed transactionally from an empty database.

| Migration | Result |
| --- | --- |
| 001 foundation | Passed |
| 002 Rental/DEUR | Passed |
| 003 billing/integration | Passed |
| 004 constraints/indexes/immutability | Passed |
| 005 reference seed | Passed |
| 006 import staging | Passed |
| 007 maintenance/daily logs | Passed |

Actual catalog after 007: 42 tables, 6 enums, 94 indexes, 19 application triggers, and 3 application functions. Catalog validation passed with no missing objects. The information schema reported 489 constraints, including PostgreSQL 17's exposed not-null constraints.

## Engine findings and corrections

No migration produced a PostgreSQL syntax or dependency error. The original constraint probe for an orphan Billing Statement Line reused an already-consumed DEUR, so PostgreSQL correctly raised unique violation `23505` before reaching the intended foreign key. The test now creates a distinct valid DEUR and proves foreign-key violation `23503`. An invalid tax-percentage probe was also added. No application/export logic changed.

The environment metadata query initially used removed configuration parameter `lc_collate`; PostgreSQL 17 locale metadata was instead read from `pg_database`. This changed no migration.

## Constraint and rollback results

All negative constraint probes passed with expected PostgreSQL rejections, including active Assignment uniqueness, Rental line identity, status, financial/percentage checks, snapshot/event immutability, revisions, billing consumption/orphans, finalized lines, and row versions. The representative Customer-to-Billing workflow inserted successfully inside the test transaction.

The deliberate division-by-zero rollback probe returned exit code 3 under `ON_ERROR_STOP`; `to_regclass('erp.migration_rollback_probe')` returned null afterward. Dropping/recreating `phase10c_a` and applying 001–007 again succeeded.

## Seed, import, and reconciliation

Two separately created databases produced identical seed results: 4 equipment statuses (`ad3642a8a1d04c781275d1c06a21f576`) and 8 Rental statuses (`8560474ddd840e8ce03f9051251c7198`).

The synthetic import staged 11 source records and inserted the full Equipment/Assignment/Rental/DEUR/Billing chain. IDs, source timestamps, DEUR revision 2, Rental Equipment Line identity, subtotal 800, VAT 96, withholding 16, grand total 880, and snapshot SHA-256 `53c3153a72fe3c918a50e412270f5319b8787473a273cf5e271233783a39e0ea` were preserved. Clean reconciliation returned zero exceptions.

The inconsistent fixture returned actionable exceptions for all states not structurally prevented. Identity mismatches, duplicate Rental equipment, ordinary orphans, and duplicate DEUR consumption cannot be injected without removing constraints; their PostgreSQL rejections are covered by constraint tests.
