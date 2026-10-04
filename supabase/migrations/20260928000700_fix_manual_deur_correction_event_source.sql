-- Restore the canonical event source column after the record-variable rename.
-- This forward-only recompilation preserves the correction semantics and
-- changes no business data.
DO $$
DECLARE
  definition text;
  function_oid oid;
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

  definition := replace(definition, 'event.source_deur', 'event.source');
  EXECUTE definition;
END;
$$;
