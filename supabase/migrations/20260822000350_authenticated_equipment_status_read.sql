BEGIN;
SET search_path TO erp, public;

ALTER TABLE equipment_statuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE equipment_statuses FROM authenticated;
GRANT SELECT (id, code, name, description, active, deleted_at, sort_order)
  ON equipment_statuses TO authenticated;

DROP POLICY IF EXISTS equipment_statuses_authenticated_read ON equipment_statuses;
CREATE POLICY equipment_statuses_authenticated_read
  ON equipment_statuses
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

COMMIT;
