BEGIN;
SET search_path TO erp, public;

ALTER TABLE equipment_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE equipment_statuses FROM anon, authenticated;
GRANT USAGE ON SCHEMA erp TO anon;
GRANT SELECT (id, code, name, description, active, deleted_at, sort_order) ON equipment_statuses TO anon;

CREATE POLICY equipment_statuses_anonymous_read
  ON equipment_statuses
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

COMMIT;
