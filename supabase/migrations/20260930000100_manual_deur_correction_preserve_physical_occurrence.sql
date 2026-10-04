BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- Correction revisions must preserve the source event's physical occurrence
-- time.  Bootstrap classification remains an immutable provenance marker;
-- it must not rewrite the physical timeline of the replacement revision.
DO $$
DECLARE
  definition text;
  function_oid oid;
  occurrence_marker text := 'CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source_deur,e) THEN revision.created_at ELSE e.occurred_at END';
  server_marker text := 'CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source_deur,e) THEN revision.created_at ELSE now_at END';
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO function_oid, definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'erp'
    AND p.proname = 'command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid) = 'command jsonb';

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing';
  END IF;
  IF position(occurrence_marker IN definition) = 0 THEN
    RAISE EXCEPTION 'manual correction bootstrap occurrence marker missing';
  END IF;
  IF position(server_marker IN definition) = 0 THEN
    RAISE EXCEPTION 'manual correction bootstrap server marker missing';
  END IF;

  definition := replace(definition, occurrence_marker, 'e.occurred_at');
  definition := replace(definition, server_marker, 'now_at');
  EXECUTE definition;
END;
$$;
COMMENT ON FUNCTION erp.command_create_deur_correction(jsonb) IS
  'Creates immutable correction revisions while preserving source physical occurrence timestamps and bootstrap provenance.';
COMMIT;
