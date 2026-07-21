# Migration Strategy

## Objective

Replace local storage with transactional repositories without changing feature services or React consumers. Database selection, RBAC, Collections redesign, and reporting are later phases.

## Preparation

1. Freeze storage keys and schema versions.
2. Inventory legacy arrays, versioned envelopes, compatibility materializers, and malformed-data behavior.
3. Define DTOs for Rentals, lines, terms/snapshots, DEUR revisions/events, and Billing Statements/lines.
4. Standardize boundary errors with code, message, context, recoverability, and recommended action.
5. Run common repository contract tests against local and future server adapters.

## Relational boundaries

Rental is the transaction root. Equipment Line requires Rental, equipment, and operator references. Terms are mutable pre-release; snapshots are append-once. New DEURs require Rental and line foreign keys. Statements belong to Rental and lines reference their source DEUR and equipment line. Unique constraints must prevent duplicate equipment lines, statement identities, and active DEUR consumption.

## Migration sequence

1. Export and validate a versioned backup.
2. Normalize structural legacy relationships without synthesizing accounting detail.
3. Import master data, Assignments/Rentals, lines/terms/snapshots, DEUR chains, then statements.
4. Reconcile counts, foreign keys, snapshots, revisions, and totals.
5. Run read-only dual comparison before switching adapters.
6. Retain the local export for rollback; do not dual-write without idempotency keys.

The server must atomically persist statements and DEUR consumption, enforce authorization, use optimistic concurrency, generate audit identity/timestamps, and store money with explicit precision and currency. Historical totals must not be recalculated during import.
