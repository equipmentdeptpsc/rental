BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Preserve the canonical physical-timeline validator.  The hosted manual
-- submit path already returns its safe validation code, but older client
-- mappings collapse these codes to PERSISTENCE_FAILURE.  Keep the command
-- contract explicit by adding a sanitized message and diagnostic payload only
-- at that existing validation boundary; no DEUR rows are written here.
DO $$
DECLARE
  function_oid oid;
  definition text;
  old_branch text := 'jsonb_build_object(''success'',false,''code'',timeline_code)';
  new_branch text := 'jsonb_build_object(''success'',false,''code'',timeline_code,''message'',timeline_code,''retryable'',false,''refreshRequired'',false)';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid)
    INTO function_oid,definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND p.proname='command_submit_manual_deur'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_submit_manual_deur(jsonb) is missing';
  END IF;
  IF length(definition)-length(replace(definition,old_branch,''))<>length(old_branch) THEN
    RAISE EXCEPTION 'expected manual submit timeline validation branch is missing';
  END IF;
  IF position('''retryable'',false,''refreshRequired'',false' IN definition)>0 THEN
    RAISE EXCEPTION 'manual submit timeline diagnostics are already installed';
  END IF;

  definition:=replace(definition,old_branch,new_branch);
  EXECUTE definition;
END;
$$;

COMMIT;
