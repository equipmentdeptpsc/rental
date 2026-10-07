-- Validate the final revision record immediately before the explicit INSERT.
DO $$
DECLARE
  definition text;
  function_oid oid;
  marker text := '  INSERT INTO erp.deurs (';
  validation text := $sql$
  IF revision.total_operating_minutes IS NULL OR revision.total_operating_minutes < 0
     OR revision.total_idle_minutes IS NULL OR revision.total_idle_minutes < 0
     OR revision.total_standby_minutes IS NULL OR revision.total_standby_minutes < 0
     OR revision.total_maintenance_minutes IS NULL OR revision.total_maintenance_minutes < 0
     OR revision.total_meal_break_minutes IS NULL OR revision.total_meal_break_minutes < 0
     OR revision.total_mobilization_minutes IS NULL OR revision.total_mobilization_minutes < 0
     OR revision.total_demobilization_minutes IS NULL OR revision.total_demobilization_minutes < 0 THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_CORRECTION_DEUR_MINUTES','details',jsonb_build_object(
      'total_operating_minutes',revision.total_operating_minutes,'total_idle_minutes',revision.total_idle_minutes,
      'total_standby_minutes',revision.total_standby_minutes,'total_maintenance_minutes',revision.total_maintenance_minutes,
      'total_meal_break_minutes',revision.total_meal_break_minutes,'total_mobilization_minutes',revision.total_mobilization_minutes,
      'total_demobilization_minutes',revision.total_demobilization_minutes));
  END IF;
  $sql$;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'explicit correction insert marker missing'; END IF;
  definition:=replace(definition,marker,validation||E'\n'||marker);
  EXECUTE definition;
END;
$$;
