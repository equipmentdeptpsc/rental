-- Prove the runtime destination row and surface safe check-violation metadata.
DO $$
DECLARE
  definition text;
  function_oid oid;
  marker text := '  INSERT INTO erp.deurs (';
  typed_validation text;
  suffix text;
BEGIN
  typed_validation := E'  v_revision := revision;\n  BEGIN\n';
  suffix := E'\n  EXCEPTION WHEN check_violation THEN\n'
    || E'    GET STACKED DIAGNOSTICS returned_sqlstate=RETURNED_SQLSTATE, constraint_name=CONSTRAINT_NAME, table_name=TABLE_NAME, schema_name=SCHEMA_NAME;\n'
    || E'    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_DEUR_INSERT_CHECK_FAILED'',''details'',jsonb_build_object(''schema'',schema_name,''table'',table_name,''constraint'',constraint_name,''sqlstate'',returned_sqlstate));\n'
    || E'  END;';
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'correction insert marker missing'; END IF;
  definition:=replace(definition,'payload_hash text; response jsonb; calculated record;','payload_hash text; response jsonb; calculated record; v_revision erp.deurs%ROWTYPE; returned_sqlstate text; constraint_name text; table_name text; schema_name text;');
  definition:=replace(definition,marker,typed_validation||marker);
  definition:=replace(definition,'revision.row_version,tenant;',E'revision.row_version,tenant;\n'||suffix);
  EXECUTE definition;
END;
$$;
