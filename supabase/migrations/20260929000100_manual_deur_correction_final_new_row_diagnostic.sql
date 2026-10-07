-- Diagnostic-only boundary for the final NEW row of a manual correction.
-- The zz_ prefix makes this the last same-event BEFORE INSERT trigger under
-- PostgreSQL's name ordering, after the existing a_* correction triggers.
CREATE OR REPLACE FUNCTION erp.diagnose_manual_deur_correction_final_new_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
DECLARE
  diagnostic jsonb;
BEGIN
  IF NEW.previous_revision_id IS NULL
     OR NEW.creation_source IS DISTINCT FROM 'MANUAL_WEB'
     OR NEW.correction_reason_code IS NULL
  THEN
    RETURN NEW;
  END IF;

  diagnostic := jsonb_build_object(
    'status', NEW.status,
    'creation_source', NEW.creation_source,
    'evidence_mode', NEW.evidence_mode,
    'minutes', jsonb_build_object(
      'total_operating_minutes', jsonb_build_object('value', NEW.total_operating_minutes, 'isNull', NEW.total_operating_minutes IS NULL, 'isNegative', NEW.total_operating_minutes < 0, 'expectedType', 'integer'),
      'total_idle_minutes', jsonb_build_object('value', NEW.total_idle_minutes, 'isNull', NEW.total_idle_minutes IS NULL, 'isNegative', NEW.total_idle_minutes < 0, 'expectedType', 'integer'),
      'total_standby_minutes', jsonb_build_object('value', NEW.total_standby_minutes, 'isNull', NEW.total_standby_minutes IS NULL, 'isNegative', NEW.total_standby_minutes < 0, 'expectedType', 'integer'),
      'total_maintenance_minutes', jsonb_build_object('value', NEW.total_maintenance_minutes, 'isNull', NEW.total_maintenance_minutes IS NULL, 'isNegative', NEW.total_maintenance_minutes < 0, 'expectedType', 'integer'),
      'total_meal_break_minutes', jsonb_build_object('value', NEW.total_meal_break_minutes, 'isNull', NEW.total_meal_break_minutes IS NULL, 'isNegative', NEW.total_meal_break_minutes < 0, 'expectedType', 'integer'),
      'total_mobilization_minutes', jsonb_build_object('value', NEW.total_mobilization_minutes, 'isNull', NEW.total_mobilization_minutes IS NULL, 'isNegative', NEW.total_mobilization_minutes < 0, 'expectedType', 'integer'),
      'total_demobilization_minutes', jsonb_build_object('value', NEW.total_demobilization_minutes, 'isNull', NEW.total_demobilization_minutes IS NULL, 'isNegative', NEW.total_demobilization_minutes < 0, 'expectedType', 'integer')
    )
  );

  RAISE EXCEPTION USING
    ERRCODE='P0001',
    MESSAGE='CORRECTION_FINAL_NEW_ROW_DIAGNOSTIC',
    DETAIL=diagnostic::text;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='erp'
      AND c.relname='deurs'
      AND t.tgname='zz_diagnose_manual_deur_correction_final_new_row'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER zz_diagnose_manual_deur_correction_final_new_row
      BEFORE INSERT ON erp.deurs
      FOR EACH ROW
      EXECUTE FUNCTION erp.diagnose_manual_deur_correction_final_new_row();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION erp.diagnose_manual_deur_correction_final_new_row() FROM PUBLIC;
