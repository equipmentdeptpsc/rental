# Migration Reconciliation Guide

## Controlled flow

1. Freeze and retain the original Local Storage export.
2. Verify manifest and repository checksums.
3. Insert raw records into `migration_import_batches` and `migration_staging_records` only.
4. Validate envelopes, IDs, enum values, dates, decimals, foreign keys, legacy associations, and immutable snapshot hashes.
5. Transform parent-first with pure, idempotent functions.
6. Import relational rows in documented dependency order.
7. Run `reconciliation/001_exception_queries.sql`; every returned row requires disposition.
8. Compare repository/table counts and persisted billing/invoice totals.
9. Approve cutover only after a clean rerun and restore rehearsal.

The exception suite covers Rentals without lines, duplicate line equipment, released lines without snapshots, unresolved or mismatched DEUR identity, duplicate line/date/shift DEURs, acknowledged DEURs without evidence, statement/line total mismatches, duplicate billing consumption, missing snapshot hashes, invoice-state inconsistencies, excess collections, missing audit actors, and unresolved staging rows. Database keys additionally expose ordinary orphan and duplicate-ID failures during validation/import.

Phase 10C executed the suite against both deliberately inconsistent fixtures and a clean restored fixture. Actionable exceptions were returned for injectable states; states prevented by unique or foreign-key constraints were verified by `constraint_tests.sql`. The clean import and restored backup returned no exceptions.

## Rollback

Before cutover, rollback means dropping/resetting the disposable database and rerunning all migrations. After a future cutover, restore the verified database backup, switch back to the prior application adapter, and retain the untouched Local Storage export. Versioned migrations are execute-once and have no production downgrade scripts.
