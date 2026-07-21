# PostgreSQL design scripts

These scripts are a production schema design. They are not wired to the application and must not be run against production until the Local Storage export, reconciliation, rollback, and cutover gates are approved.

Apply to a new database in filename order:

1. `001_foundation.sql`
2. `002_rental_deur.sql`
3. `003_billing_integration.sql`
4. `004_constraints_indexes_immutability.sql`
5. `005_seed_reference.sql`

Application-generated text IDs are retained. Monetary totals use `numeric(19,4)`, rates and quantities use `numeric(19,6)`, elapsed hours use `numeric(14,4)`, and percentages use `numeric(9,6)`. PostgreSQL performs no floating-point arithmetic on billing evidence.

Every mutable aggregate has a `row_version` updated by a `BEFORE UPDATE` trigger. A future adapter must update with `WHERE id = :id AND row_version = :expected_version` and treat an affected-row count of zero as a concurrency conflict.

Soft deletion is restricted to mutable/reference records. Commercial snapshots, DEUR events/reviews, equipment history, audit entries, and non-draft billing evidence are append-only. Historical foreign keys use `ON DELETE RESTRICT` (the PostgreSQL default when omitted).
