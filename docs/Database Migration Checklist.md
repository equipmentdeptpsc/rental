# Database Migration Checklist

## Before implementation

- Freeze repository DTOs, storage keys, and schema versions.
- Run repository contract, compatibility, backup, and full workflow suites.
- Export and validate a complete backup.
- Define database precision for money and timezone policy for timestamps.
- Map every repository descriptor to tables, constraints, indexes, and ownership.
- Define server-generated audit metadata and optimistic concurrency tokens.

## Adapter implementation

- Implement repository interfaces behind composition-root injection.
- Add a new application dependency factory and change only bootstrap selection; do not import vendor clients into features.
- Keep vendor clients out of domain and UI modules.
- Implement deterministic paging and domain lookup parity.
- Translate vendor errors into structured repository errors.
- Implement transactions for Rental release and Billing Statement/DEUR consumption.
- Enforce unique DEUR consumption and equipment-line identities in constraints.
- Preserve immutable commercial and accounting snapshots.

## Data migration

- Import master data before transactional aggregates.
- Import Rentals before Equipment Lines, DEURs, and Billing Statements.
- Preserve identifiers, revision chains, timestamps, and monetary values.
- Quarantine ambiguous legacy records instead of guessing.
- Reconcile counts, relationships, line totals, and backup checksums.

## Cutover

- Run read-only parity comparison between adapters.
- Test rollback from the final backup.
- Disable dual writes unless operations have idempotency keys.
- Verify authorization, audit integrity, concurrency, offline replay, and monitoring.
- Switch only at the composition root; business services and UI must remain unchanged.
