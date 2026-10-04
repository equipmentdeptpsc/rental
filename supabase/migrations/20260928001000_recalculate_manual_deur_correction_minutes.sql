-- Use the canonical event-derived totals when cloning a manual DEUR.  This
-- preserves the schema constraint and matches the normal DEUR path.
DO $$
DECLARE
  definition text;
  function_oid oid;
  marker text := 'payload_hash text; response jsonb;';
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO function_oid, definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'manual correction declaration marker missing'; END IF;
  definition:=replace(definition, marker, 'payload_hash text; response jsonb; calculated record;');
  definition:=replace(definition,
    'IF source_deur.id IS NULL THEN RETURN jsonb_build_object(''success'',false,''code'',''NOT_FOUND''); END IF;',
    'IF source_deur.id IS NULL THEN RETURN jsonb_build_object(''success'',false,''code'',''NOT_FOUND''); END IF; SELECT * INTO calculated FROM erp.recalculate_deur_event_totals(source_deur.id);');
  definition:=replace(definition,
    'revision.total_operating_minutes:=coalesce(source_deur.total_operating_minutes,0); revision.total_idle_minutes:=coalesce(source_deur.total_idle_minutes,0); revision.total_standby_minutes:=coalesce(source_deur.total_standby_minutes,0); revision.total_maintenance_minutes:=coalesce(source_deur.total_maintenance_minutes,0); revision.total_meal_break_minutes:=coalesce(source_deur.total_meal_break_minutes,0); revision.total_mobilization_minutes:=coalesce(source_deur.total_mobilization_minutes,0); revision.total_demobilization_minutes:=coalesce(source_deur.total_demobilization_minutes,0);',
    'revision.total_operating_minutes:=coalesce(calculated.operation_minutes,0); revision.total_idle_minutes:=coalesce(calculated.idle_minutes,0); revision.total_standby_minutes:=coalesce(calculated.standby_minutes,0); revision.total_maintenance_minutes:=coalesce(calculated.breakdown_minutes,0); revision.total_meal_break_minutes:=coalesce(calculated.meal_break_minutes,0); revision.total_mobilization_minutes:=coalesce(source_deur.total_mobilization_minutes,0); revision.total_demobilization_minutes:=coalesce(source_deur.total_demobilization_minutes,0);');
  EXECUTE definition;
END;
$$;
