BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A correction replacement intentionally retains one synthetic shift/start
-- marker as an open encoding bootstrap.  It is not an open physical activity
-- and must not block canonical submission.  Real open activity events still
-- block submission exactly as before.
DO $$
DECLARE
  function_oid oid;
  definition text;
  old_guard text := 'OR EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE deur_id=current_deur.id AND is_open)';
  new_guard text := 'OR EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE deur_id=current_deur.id AND is_open AND NOT erp.is_manual_deur_encoding_bootstrap_event(current_deur,event_record))';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid)
    INTO function_oid,definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND p.proname='command_submit_deur'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_submit_deur(jsonb) is missing';
  END IF;
  IF position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'expected canonical submit open-event guard is missing';
  END IF;
  IF position('erp.is_manual_deur_encoding_bootstrap_event(current_deur,event_record)' IN definition)>0 THEN
    RAISE EXCEPTION 'bootstrap-aware submit guard is already installed';
  END IF;

  definition:=replace(definition,old_guard,new_guard);
  EXECUTE definition;
END;
$$;
COMMIT;
