-- Capture the exact event-total tuple that is about to be written for one
-- correction-revision shift/end event. This is diagnostic-only: it raises a
-- user-defined exception before the parent DEUR UPDATE and therefore leaves
-- no persistent diagnostic rows or business-data changes.
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.refresh_deur_totals_after_shift_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
DECLARE
  calculated record;
  target erp.deurs%ROWTYPE;
  diagnostic jsonb;
BEGIN
  IF NEW.activity_type='shift' AND NEW.action='end' THEN
    SELECT d.* INTO target
    FROM erp.deurs AS d
    WHERE d.id=NEW.deur_id;

    SELECT * INTO calculated
    FROM erp.recalculate_deur_event_totals(NEW.deur_id);

    IF target.previous_revision_id IS NOT NULL
       AND target.creation_source='MANUAL_WEB'
       AND target.correction_reason_code IS NOT NULL
    THEN
      diagnostic := jsonb_build_object(
        'targetClassification','CORRECTION_REPLACEMENT',
        'eventType',NEW.activity_type,
        'eventAction',NEW.action,
        'minutes',jsonb_build_object(
          'operating',jsonb_build_object('value',calculated.operation_minutes,'isNull',calculated.operation_minutes IS NULL,'isNegative',coalesce(calculated.operation_minutes < 0,false)),
          'idle',jsonb_build_object('value',calculated.idle_minutes,'isNull',calculated.idle_minutes IS NULL,'isNegative',coalesce(calculated.idle_minutes < 0,false)),
          'standby',jsonb_build_object('value',calculated.standby_minutes,'isNull',calculated.standby_minutes IS NULL,'isNegative',coalesce(calculated.standby_minutes < 0,false)),
          'maintenance',jsonb_build_object('value',calculated.breakdown_minutes,'isNull',calculated.breakdown_minutes IS NULL,'isNegative',coalesce(calculated.breakdown_minutes < 0,false)),
          'mealBreak',jsonb_build_object('value',calculated.meal_break_minutes,'isNull',calculated.meal_break_minutes IS NULL,'isNegative',coalesce(calculated.meal_break_minutes < 0,false)),
          'mobilization',jsonb_build_object('value',target.total_mobilization_minutes,'isNull',target.total_mobilization_minutes IS NULL,'isNegative',coalesce(target.total_mobilization_minutes < 0,false)),
          'demobilization',jsonb_build_object('value',target.total_demobilization_minutes,'isNull',target.total_demobilization_minutes IS NULL,'isNegative',coalesce(target.total_demobilization_minutes < 0,false))
        )
      );

      RAISE EXCEPTION USING
        ERRCODE='PZ002',
        MESSAGE='CORRECTION_EVENT_TOTALS_DIAGNOSTIC',
        DETAIL=diagnostic::text;
    END IF;

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

-- Preserve the normal correction command contract while transporting the
-- diagnostic exception as safe JSON. The command body itself is unchanged.
DO $$
DECLARE
  definition text;
  function_oid oid;
  declaration_marker text := ' outer_detail text;';
  exception_marker text := E'  EXCEPTION WHEN SQLSTATE ''PZ001'' THEN';
  exception_replacement text := E'  EXCEPTION WHEN SQLSTATE ''PZ002'' THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_detail=PG_EXCEPTION_DETAIL;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_EVENT_TOTALS_DIAGNOSTIC'',''message'',''Correction event totals were captured before validation.'',''retryable'',false,''refreshRequired'',false,''details'',outer_detail::jsonb);\n  WHEN SQLSTATE ''PZ001'' THEN';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing';
  END IF;
  IF position(declaration_marker IN definition)=0 THEN
    RAISE EXCEPTION 'correction diagnostic transport declaration is missing';
  END IF;
  IF position(exception_marker IN definition)=0 THEN
    RAISE EXCEPTION 'correction PZ001 diagnostic handler is missing';
  END IF;
  IF position('CORRECTION_EVENT_TOTALS_DIAGNOSTIC' IN definition)>0 THEN
    RAISE EXCEPTION 'correction event totals diagnostic is already installed';
  END IF;

  definition:=replace(definition,exception_marker,exception_replacement);
  EXECUTE definition;
END;
$$;

COMMIT;
