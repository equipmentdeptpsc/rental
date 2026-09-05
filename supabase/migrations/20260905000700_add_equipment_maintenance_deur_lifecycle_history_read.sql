BEGIN;

SET LOCAL search_path = erp, auth, public;

CREATE OR REPLACE FUNCTION erp.get_equipment_maintenance_lifecycle_events(target_equipment_id text, requested_limit integer DEFAULT 10)
RETURNS TABLE (id text, maintenance_record_id text, event_type text, occurred_at date, occurred_at_precision text, maintenance_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH visible_equipment AS (
    SELECT e.id, e.company_id FROM erp.equipment e
    WHERE e.id=target_equipment_id AND e.deleted_at IS NULL
      AND erp.can_read_company_row(e.company_id)
      AND erp.current_user_has_permission('maintenance.read')
  ), events AS (
    SELECT m.id || ':Scheduled:' || m.scheduled_date::text, m.id, 'Scheduled'::text, m.scheduled_date, 'date'::text, m.maintenance_type
    FROM erp.maintenance_records m JOIN visible_equipment e ON e.id=m.equipment_id
    WHERE m.deleted_at IS NULL AND m.scheduled_date IS NOT NULL
    UNION ALL
    SELECT m.id || ':Completed:' || m.completed_date::text, m.id, 'Completed'::text, m.completed_date, 'date'::text, m.maintenance_type
    FROM erp.maintenance_records m JOIN visible_equipment e ON e.id=m.equipment_id
    WHERE m.deleted_at IS NULL AND m.completed_date IS NOT NULL
  )
  SELECT * FROM events ORDER BY occurred_at DESC, id DESC
  LIMIT LEAST(20, GREATEST(1, COALESCE(requested_limit, 10)));
$$;

CREATE OR REPLACE FUNCTION erp.get_equipment_deur_lifecycle_events(target_equipment_id text, requested_limit integer DEFAULT 10)
RETURNS TABLE (id text, deur_id text, deur_number text, event_type text, occurred_at timestamptz, occurred_at_precision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH visible_equipment AS (
    SELECT e.id, e.company_id FROM erp.equipment e
    WHERE e.id=target_equipment_id AND e.deleted_at IS NULL
      AND erp.can_read_company_row(e.company_id)
      AND erp.current_user_has_permission('deur.read')
  ), visible_deurs AS (
    SELECT d.id, d.deur_number, d.created_at, d.submitted_at, d.acknowledged_at, d.rejected_at, d.corrected_at
    FROM erp.deurs d JOIN visible_equipment e ON e.id=d.equipment_id AND e.company_id=d.company_id
  ), events AS (
    SELECT d.id || ':Created:' || d.created_at::text, d.id, d.deur_number, 'Created'::text, d.created_at, 'timestamp'::text FROM visible_deurs d
    UNION ALL SELECT d.id || ':Submitted:' || d.submitted_at::text, d.id, d.deur_number, 'Submitted'::text, d.submitted_at, 'timestamp'::text FROM visible_deurs d WHERE d.submitted_at IS NOT NULL
    UNION ALL SELECT d.id || ':Acknowledged:' || d.acknowledged_at::text, d.id, d.deur_number, 'Acknowledged'::text, d.acknowledged_at, 'timestamp'::text FROM visible_deurs d WHERE d.acknowledged_at IS NOT NULL
    UNION ALL SELECT d.id || ':Rejected:' || d.rejected_at::text, d.id, d.deur_number, 'Rejected'::text, d.rejected_at, 'timestamp'::text FROM visible_deurs d WHERE d.rejected_at IS NOT NULL
    UNION ALL SELECT d.id || ':CorrectionRevisionCreated:' || d.corrected_at::text, d.id, d.deur_number, 'CorrectionRevisionCreated'::text, d.corrected_at, 'timestamp'::text FROM visible_deurs d WHERE d.corrected_at IS NOT NULL
  )
  SELECT * FROM events ORDER BY occurred_at DESC, id DESC
  LIMIT LEAST(20, GREATEST(1, COALESCE(requested_limit, 10)));
$$;

ALTER FUNCTION erp.get_equipment_maintenance_lifecycle_events(text, integer) OWNER TO postgres;
ALTER FUNCTION erp.get_equipment_deur_lifecycle_events(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.get_equipment_maintenance_lifecycle_events(text, integer), erp.get_equipment_deur_lifecycle_events(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.get_equipment_maintenance_lifecycle_events(text, integer), erp.get_equipment_deur_lifecycle_events(text, integer) TO authenticated;
COMMENT ON FUNCTION erp.get_equipment_maintenance_lifecycle_events(text, integer) IS 'Read-only, tenant-derived Equipment Maintenance lifecycle history. Only scheduled_date and completed_date are emitted with date precision.';
COMMENT ON FUNCTION erp.get_equipment_deur_lifecycle_events(text, integer) IS 'Read-only, tenant-derived Equipment DEUR lifecycle summary. It omits operational activity events and uses explicit canonical lifecycle timestamps.';

COMMIT;
