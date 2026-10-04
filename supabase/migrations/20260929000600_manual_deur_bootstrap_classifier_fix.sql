BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A MANUAL_WEB DEUR's bootstrap is the synthetic shift/start marker created
-- with the DEUR.  The operation/start row can legitimately share that
-- timestamp, but it is part of the physical timeline and must retain its
-- occurrence time when a correction revision is cloned.
CREATE OR REPLACE FUNCTION erp.is_manual_deur_encoding_bootstrap_event(
  target erp.deurs,
  candidate erp.deur_events
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT target.creation_source='MANUAL_WEB'
     AND candidate.deur_id=target.id
     AND candidate.source='manual-web'
     AND candidate.activity_type='shift'
     AND candidate.action='start'
     AND candidate.sequence=1
     AND candidate.is_open
     AND candidate.occurred_at=target.created_at
     AND candidate.server_accepted_at=target.created_at;
$$;
-- Restore the normal totals refresh after the temporary event-total
-- diagnostic.  The correction clone now reaches the canonical minute check.
CREATE OR REPLACE FUNCTION erp.refresh_deur_totals_after_shift_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
DECLARE calculated record;
BEGIN
  IF NEW.activity_type='shift' AND NEW.action='end' THEN
    SELECT * INTO calculated FROM erp.recalculate_deur_event_totals(NEW.deur_id);
    UPDATE erp.deurs SET
      total_operating_minutes=calculated.operation_minutes,
      total_idle_minutes=calculated.idle_minutes,
      total_standby_minutes=calculated.standby_minutes,
      total_meal_break_minutes=calculated.meal_break_minutes,
      total_maintenance_minutes=calculated.breakdown_minutes
    WHERE id=NEW.deur_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION erp.refresh_deur_totals_after_shift_end() FROM PUBLIC,anon,authenticated,service_role;
-- Remove only the temporary PZ002 transport branch installed by the
-- event-total diagnostic.  Keep the existing PZ001 final-row diagnostic and
-- the normal check-violation response contract intact.
DO $$
DECLARE
  definition text;
  function_oid oid;
  exception_marker text := E'  EXCEPTION WHEN SQLSTATE ''PZ002'' THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_detail=PG_EXCEPTION_DETAIL;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_EVENT_TOTALS_DIAGNOSTIC'',''message'',''Correction event totals were captured before validation.'',''retryable'',false,''refreshRequired'',false,''details'',outer_detail::jsonb);\n  WHEN SQLSTATE ''PZ001'' THEN';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid)
    INTO function_oid,definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing';
  END IF;
  IF position(exception_marker IN definition)=0 THEN
    RAISE EXCEPTION 'temporary correction event-total diagnostic handler is missing';
  END IF;

  definition:=replace(
    definition,
    exception_marker,
    E'  EXCEPTION WHEN SQLSTATE ''PZ001'' THEN'
  );
  EXECUTE definition;
END;
$$;
COMMIT;
