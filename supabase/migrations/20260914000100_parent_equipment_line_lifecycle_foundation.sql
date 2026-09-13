BEGIN;

SET LOCAL search_path = erp, pg_catalog;

-- D5B1A is intentionally additive.  The established shared status columns
-- remain the compatibility authority until the follow-up command migration.
-- These columns provide distinct canonical representations without rewriting
-- historical Returned/Assigned parent records or current certified workflows.
CREATE TYPE erp.rental_parent_status AS ENUM (
  'Draft', 'Reserved', 'Released', 'Active', 'Cancelled', 'Closed'
);

CREATE TYPE erp.rental_equipment_line_status AS ENUM (
  'Draft', 'Reserved', 'Released', 'Active', 'Returned', 'Cancelled'
);

ALTER TABLE erp.rentals
  ADD COLUMN canonical_parent_status erp.rental_parent_status NULL;

ALTER TABLE erp.rental_equipment_lines
  ADD COLUMN canonical_line_status erp.rental_equipment_line_status NULL,
  ADD COLUMN effective_start_date date NULL;

-- Target-compatible parent states can be copied without interpretation.
-- Legacy Assigned and Returned parents intentionally remain NULL here: their
-- shared legacy status is preserved for read compatibility until a later,
-- evidence-backed remediation decides an explicit parent lifecycle state.
UPDATE erp.rentals
SET canonical_parent_status = CASE status::text
  WHEN 'Draft' THEN 'Draft'::erp.rental_parent_status
  WHEN 'Reserved' THEN 'Reserved'::erp.rental_parent_status
  WHEN 'Released' THEN 'Released'::erp.rental_parent_status
  WHEN 'Active' THEN 'Active'::erp.rental_parent_status
  WHEN 'Cancelled' THEN 'Cancelled'::erp.rental_parent_status
  WHEN 'Closed' THEN 'Closed'::erp.rental_parent_status
  WHEN 'Assigned' THEN NULL
  WHEN 'Returned' THEN NULL
  ELSE NULL
END
WHERE canonical_parent_status IS NULL;

-- Existing line state is copied only where it is already one of the approved
-- line states.  Legacy Assigned/Closed values retain their old status column
-- rather than being guessed as Reserved/Returned.
UPDATE erp.rental_equipment_lines
SET canonical_line_status = CASE status::text
  WHEN 'Draft' THEN 'Draft'::erp.rental_equipment_line_status
  WHEN 'Reserved' THEN 'Reserved'::erp.rental_equipment_line_status
  WHEN 'Released' THEN 'Released'::erp.rental_equipment_line_status
  WHEN 'Active' THEN 'Active'::erp.rental_equipment_line_status
  WHEN 'Returned' THEN 'Returned'::erp.rental_equipment_line_status
  WHEN 'Cancelled' THEN 'Cancelled'::erp.rental_equipment_line_status
  WHEN 'Assigned' THEN NULL
  WHEN 'Closed' THEN NULL
  ELSE NULL
END
WHERE canonical_line_status IS NULL;

-- Before line-specific onboarding exists, the historical effective start is
-- the parent date_out that D3/D4 already use.  The nullable column permits a
-- later evidence-backed treatment of exceptional legacy rows.
UPDATE erp.rental_equipment_lines AS line
SET effective_start_date = rental.date_out
FROM erp.rentals AS rental
WHERE rental.id = line.rental_id
  AND rental.company_id = line.company_id
  AND line.effective_start_date IS NULL;

-- The old unconditional constraint prevents valid historical soft-deleted
-- episodes.  Its replacement still rejects duplicate non-deleted equipment
-- lines within the same parent Rental.
ALTER TABLE erp.rental_equipment_lines
  DROP CONSTRAINT IF EXISTS rental_equipment_lines_rental_id_equipment_id_key;

CREATE UNIQUE INDEX uq_rental_equipment_lines_non_deleted_equipment
  ON erp.rental_equipment_lines(rental_id, equipment_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN erp.rentals.canonical_parent_status IS
  'D5 canonical parent lifecycle. NULL denotes a preserved legacy Assigned or Returned parent status pending later remediation.';
COMMENT ON COLUMN erp.rental_equipment_lines.canonical_line_status IS
  'D5 canonical equipment-line lifecycle. NULL denotes a preserved legacy Assigned or Closed line status pending later remediation.';
COMMENT ON COLUMN erp.rental_equipment_lines.effective_start_date IS
  'Canonical line commitment start. Backfilled from parent date_out; D3/D4 continue using existing interval logic until a later migration.';

COMMIT;
