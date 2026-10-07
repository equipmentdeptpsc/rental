-- Add one outer check-violation boundary with phase diagnostics to correction.
DO $$
DECLARE
  definition text;
  function_oid oid;
  declaration_marker text := '  payload_hash text; response jsonb; calculated record; v_revision erp.deurs%ROWTYPE; returned_sqlstate text; constraint_name text; table_name text; schema_name text; source_update_sqlstate text; source_update_constraint text; source_update_table text; source_update_schema text;';
  function_start text := E'BEGIN\n  IF tenant IS NULL';
  function_start_replacement text := E'BEGIN\n  BEGIN\n    v_phase := ''START'';\n  IF tenant IS NULL';
  function_end text := '  RETURN erp.finish_operational_command(command,''CREATE_DEUR_CORRECTION'',''DEUR'',source_deur.id,tenant,auth.uid()::text,payload_hash,response,1);';
  function_end_replacement text := E'  v_phase := ''RETURN'';\n  RETURN erp.finish_operational_command(command,''CREATE_DEUR_CORRECTION'',''DEUR'',source_deur.id,tenant,auth.uid()::text,payload_hash,response,1);\n  EXCEPTION WHEN check_violation THEN\n    GET STACKED DIAGNOSTICS outer_sqlstate=RETURNED_SQLSTATE, outer_constraint=CONSTRAINT_NAME, outer_table=TABLE_NAME, outer_schema=SCHEMA_NAME;\n    RETURN jsonb_build_object(''success'',false,''code'',''CORRECTION_CHECK_FAILED'',''details'',jsonb_build_object(''phase'',v_phase,''sqlstate'',outer_sqlstate,''schema'',outer_schema,''table'',outer_table,''constraint'',outer_constraint));\n  END;';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(declaration_marker in definition)=0 THEN RAISE EXCEPTION 'correction declaration marker missing'; END IF;
  IF position(function_start in definition)=0 THEN RAISE EXCEPTION 'correction function start marker missing'; END IF;
  IF position(function_end in definition)=0 THEN RAISE EXCEPTION 'correction function end marker missing'; END IF;
  definition:=replace(definition,declaration_marker,declaration_marker||' outer_sqlstate text; outer_constraint text; outer_table text; outer_schema text; v_phase text := ''START'';');
  definition:=replace(definition,function_start,function_start_replacement);
  definition:=replace(definition,'  SELECT d.* INTO source_deur FROM erp.deurs d WHERE d.id=command->>''sourceRevisionId'' AND d.company_id=tenant FOR UPDATE;',E'  v_phase := ''SOURCE_READ'';\n  SELECT d.* INTO source_deur FROM erp.deurs d WHERE d.id=command->>''sourceRevisionId'' AND d.company_id=tenant FOR UPDATE;');
  definition:=replace(definition,'  IF source_deur.total_operating_minutes IS NULL OR source_deur.total_operating_minutes < 0 THEN',E'  v_phase := ''SOURCE_VALIDATE'';\n  IF source_deur.total_operating_minutes IS NULL OR source_deur.total_operating_minutes < 0 THEN');
  definition:=replace(definition,'  BEGIN\n  UPDATE erp.deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at WHERE id=source_deur.id;',E'  v_phase := ''SOURCE_SUPERSEDE_UPDATE'';\n  BEGIN\n  UPDATE erp.deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at WHERE id=source_deur.id;');
  definition:=replace(definition,'  v_revision := revision;',E'  v_phase := ''REVISION_INSERT'';\n  v_revision := revision;');
  definition:=replace(definition,'  INSERT INTO erp.deur_events(',E'  v_phase := ''EVENT_CLONE'';\n  INSERT INTO erp.deur_events(');
  definition:=replace(definition,'    INSERT INTO erp.deur_meter_checkpoints(',E'    v_phase := ''CHECKPOINT_CLONE'';\n    INSERT INTO erp.deur_meter_checkpoints(');
  definition:=replace(definition,'    INSERT INTO erp.deur_refuels(',E'    v_phase := ''REFUEL_CLONE'';\n    INSERT INTO erp.deur_refuels(');
  definition:=replace(definition,'  UPDATE erp.customer_review_requests SET status=''Revoked'',revoked_at=now_at WHERE revision_id=source_deur.id AND status=''Pending'';',E'  v_phase := ''CORRECTION_RESOLUTION'';\n  UPDATE erp.customer_review_requests SET status=''Revoked'',revoked_at=now_at WHERE revision_id=source_deur.id AND status=''Pending'';');
  definition:=replace(definition,'  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)',E'  v_phase := ''AUDIT'';\n  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)');
  definition:=replace(definition,function_end,function_end_replacement);
  IF position('CORRECTION_CHECK_FAILED' in definition)=0 OR position('v_phase' in definition)=0 THEN RAISE EXCEPTION 'outer correction diagnostics were not injected'; END IF;
  EXECUTE definition;
END;
$$;
