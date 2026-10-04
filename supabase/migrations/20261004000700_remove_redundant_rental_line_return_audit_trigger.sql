BEGIN;

-- Migration 00500 added a row-level audit trigger for the same transition that
-- the canonical return command already audits.  Keep the command-authored
-- audit as the source of truth: it carries the command correlation/idempotency
-- identity and is executed once by the per-line command, including Return All
-- child returns.  This removes only the redundant trigger and preserves all
-- historical audit rows.
DROP TRIGGER IF EXISTS audit_canonical_rental_line_return ON erp.rental_equipment_lines;
DROP FUNCTION IF EXISTS erp.audit_canonical_rental_line_return();

COMMIT;
