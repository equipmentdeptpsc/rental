BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- The correction function's PL/pgSQL record named `source` collides with the
-- `source` column used while cloning manual DEUR events. Recompile only this
-- function with an explicit record name; no data or domain behavior changes.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='erp'
     AND p.proname='command_create_deur_correction'
     AND pg_get_function_identity_arguments(p.oid)='command jsonb';

  IF definition IS NULL THEN
    RAISE EXCEPTION 'Canonical correction function was not found';
  END IF;

  definition:=replace(definition, 'source erp.deurs%ROWTYPE', 'source_deur erp.deurs%ROWTYPE');
  definition:=replace(definition, ' INTO source FROM ', ' INTO source_deur FROM ');
  definition:=replace(definition, 'source.', 'source_deur.');
  EXECUTE definition;
END $$;
COMMIT;
