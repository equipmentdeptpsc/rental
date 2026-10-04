-- Surface only safe computed minute values when correction input is invalid.
DO $$
DECLARE
  definition text;
  function_oid oid;
  marker text := '  INSERT INTO erp.deurs (';
  validation text := $sql$
  IF calculated.operation_minutes IS NULL OR calculated.operation_minutes < 0
     OR calculated.idle_minutes IS NULL OR calculated.idle_minutes < 0
     OR calculated.standby_minutes IS NULL OR calculated.standby_minutes < 0
     OR calculated.breakdown_minutes IS NULL OR calculated.breakdown_minutes < 0
     OR calculated.meal_break_minutes IS NULL OR calculated.meal_break_minutes < 0
     OR coalesce(source_deur.total_mobilization_minutes,0) < 0
     OR coalesce(source_deur.total_demobilization_minutes,0) < 0 THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_CORRECTION_DEUR_MINUTES','details',jsonb_build_object(
      'total_operating_minutes',calculated.operation_minutes,'total_idle_minutes',calculated.idle_minutes,
      'total_standby_minutes',calculated.standby_minutes,'total_maintenance_minutes',calculated.breakdown_minutes,
      'total_meal_break_minutes',calculated.meal_break_minutes,
      'total_mobilization_minutes',source_deur.total_mobilization_minutes,
      'total_demobilization_minutes',source_deur.total_demobilization_minutes));
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
