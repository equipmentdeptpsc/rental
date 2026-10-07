-- Isolate the pre-insert source-row update from the correction revision insert.
DO $$
DECLARE
  definition text;
  function_oid oid;
  update_marker text := '  UPDATE erp.deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at WHERE id=source_deur.id;';
  source_validation text;
  update_wrapper text;
BEGIN
  source_validation := E'  IF source_deur.total_operating_minutes IS NULL OR source_deur.total_operating_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_operating_minutes'',''value'',source_deur.total_operating_minutes));\n'
    || E'  ELSIF source_deur.total_idle_minutes IS NULL OR source_deur.total_idle_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_idle_minutes'',''value'',source_deur.total_idle_minutes));\n'
    || E'  ELSIF source_deur.total_standby_minutes IS NULL OR source_deur.total_standby_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_standby_minutes'',''value'',source_deur.total_standby_minutes));\n'
    || E'  ELSIF source_deur.total_maintenance_minutes IS NULL OR source_deur.total_maintenance_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_maintenance_minutes'',''value'',source_deur.total_maintenance_minutes));\n'
    || E'  ELSIF source_deur.total_meal_break_minutes IS NULL OR source_deur.total_meal_break_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_meal_break_minutes'',''value'',source_deur.total_meal_break_minutes));\n'
    || E'  ELSIF source_deur.total_mobilization_minutes IS NULL OR source_deur.total_mobilization_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_mobilization_minutes'',''value'',source_deur.total_mobilization_minutes));\n'
    || E'  ELSIF source_deur.total_demobilization_minutes IS NULL OR source_deur.total_demobilization_minutes < 0 THEN\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''INVALID_EXISTING_DEUR_MINUTES'',''details'',jsonb_build_object(''field'',''total_demobilization_minutes'',''value'',source_deur.total_demobilization_minutes));\n'
    || E'  END IF;\n';
  update_wrapper := E'  BEGIN\n' || update_marker || E'\n'
    || E'  EXCEPTION WHEN check_violation THEN\n'
    || E'    GET STACKED DIAGNOSTICS source_update_sqlstate=RETURNED_SQLSTATE, source_update_constraint=CONSTRAINT_NAME, source_update_table=TABLE_NAME, source_update_schema=SCHEMA_NAME;\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_SOURCE_UPDATE_CHECK_FAILED'',''details'',jsonb_build_object(''schema'',source_update_schema,''table'',source_update_table,''constraint'',source_update_constraint,''sqlstate'',source_update_sqlstate));\n'
    || E'  END;';
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(update_marker in definition)=0 THEN RAISE EXCEPTION 'correction source update marker missing'; END IF;
  definition:=replace(definition,'payload_hash text; response jsonb; calculated record; v_revision erp.deurs%ROWTYPE; returned_sqlstate text; constraint_name text; table_name text; schema_name text;','payload_hash text; response jsonb; calculated record; v_revision erp.deurs%ROWTYPE; returned_sqlstate text; constraint_name text; table_name text; schema_name text; source_update_sqlstate text; source_update_constraint text; source_update_table text; source_update_schema text;');
  definition:=replace(definition,update_marker,source_validation||update_wrapper);
  EXECUTE definition;
END;
$$;
