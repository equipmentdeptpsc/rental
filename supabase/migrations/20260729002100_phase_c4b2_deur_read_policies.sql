BEGIN;
SET search_path TO erp, auth;

DROP POLICY IF EXISTS assignments_operator_or_privileged_read
ON assignments;
DROP POLICY IF EXISTS deur_events_operator_or_privileged_read
ON deur_events;
DROP POLICY IF EXISTS deurs_operator_or_privileged_read
ON deurs;
DROP POLICY IF EXISTS rental_lines_operator_or_privileged_read
ON rental_equipment_lines;

DROP POLICY IF EXISTS tenant_read
ON deur_meter_checkpoints;
CREATE POLICY tenant_read
ON deur_meter_checkpoints
FOR SELECT
TO authenticated
USING (can_read_company_row(company_id));

GRANT SELECT ON deur_meter_checkpoints
TO authenticated;

COMMENT ON POLICY tenant_read ON deur_meter_checkpoints IS
  'Authenticated users read immutable meter checkpoints only within their active company.';

COMMIT;
