-- Preserve valid DEUR totals when cloning legacy rows whose optional minute
-- fields may be NULL, satisfying the canonical nonnegative-minute constraint.
DO $$
DECLARE
  definition text;
  function_oid oid;
  marker text := 'revision:=source_deur; revision.id:=';
  injected text := 'revision:=source_deur; revision.total_operating_minutes:=coalesce(source_deur.total_operating_minutes,0); revision.total_idle_minutes:=coalesce(source_deur.total_idle_minutes,0); revision.total_standby_minutes:=coalesce(source_deur.total_standby_minutes,0); revision.total_maintenance_minutes:=coalesce(source_deur.total_maintenance_minutes,0); revision.total_meal_break_minutes:=coalesce(source_deur.total_meal_break_minutes,0); revision.total_mobilization_minutes:=coalesce(source_deur.total_mobilization_minutes,0); revision.total_demobilization_minutes:=coalesce(source_deur.total_demobilization_minutes,0); revision.id:=';
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO function_oid, definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'manual correction clone marker missing'; END IF;
  definition:=replace(definition, marker, injected);
  EXECUTE definition;
END;
$$;
