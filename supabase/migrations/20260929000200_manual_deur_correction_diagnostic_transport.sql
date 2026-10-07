-- Make the diagnostic trigger travel through the canonical failure contract.
DO $$
DECLARE
  definition text;
  function_oid oid;
  declaration_marker text := '  payload_hash text; response jsonb; calculated record; v_revision erp.deurs%ROWTYPE; returned_sqlstate text; constraint_name text; table_name text; schema_name text; source_update_sqlstate text; source_update_constraint text; source_update_table text; source_update_schema text; outer_sqlstate text; outer_constraint text; outer_table text; outer_schema text; v_phase text := ''START'';';
  exception_marker text := E'  EXCEPTION WHEN check_violation THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_constraint=CONSTRAINT_NAME, outer_table=TABLE_NAME, outer_schema=SCHEMA_NAME;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_CHECK_FAILED'',''details'',jsonb_build_object(''phase'',v_phase,''sqlstate'',outer_sqlstate,''schema'',outer_schema,''table'',outer_table,''constraint'',outer_constraint));';
  exception_replacement text := E'  EXCEPTION WHEN SQLSTATE ''PZ001'' THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_detail=PG_EXCEPTION_DETAIL;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_FINAL_NEW_ROW_DIAGNOSTIC'',''message'',''The final correction row failed a diagnostic validation.'',''retryable'',false,''refreshRequired'',false,''details'',jsonb_build_object(''phase'',v_phase,''sqlstate'',outer_sqlstate,''diagnostic'',outer_detail::jsonb));\n  WHEN check_violation THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_constraint=CONSTRAINT_NAME, outer_table=TABLE_NAME, outer_schema=SCHEMA_NAME;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_CHECK_FAILED'',''details'',jsonb_build_object(''phase'',v_phase,''sqlstate'',outer_sqlstate,''schema'',outer_schema,''table'',outer_table,''constraint'',outer_constraint));';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(declaration_marker in definition)=0 THEN RAISE EXCEPTION 'correction transport declaration marker missing'; END IF;
  IF position(exception_marker in definition)=0 THEN RAISE EXCEPTION 'correction transport exception marker missing'; END IF;
  definition:=replace(definition,declaration_marker,declaration_marker||' outer_detail text;');
  definition:=replace(definition,exception_marker,exception_replacement);
  EXECUTE definition;
END;
$$;

-- Use a dedicated user-defined SQLSTATE so the outer command handler can
-- return a normal structured failure instead of a transport error.
DO $$
DECLARE
  definition text;
  function_oid oid;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='diagnose_manual_deur_correction_final_new_row'
    AND pg_get_function_identity_arguments(p.oid)='';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'diagnostic trigger function is missing'; END IF;
  IF position('ERRCODE=''P0001''' in definition)=0 THEN RAISE EXCEPTION 'diagnostic SQLSTATE marker missing'; END IF;
  definition:=replace(definition,'ERRCODE=''P0001''','ERRCODE=''PZ001''');
  EXECUTE definition;
END;
$$;
