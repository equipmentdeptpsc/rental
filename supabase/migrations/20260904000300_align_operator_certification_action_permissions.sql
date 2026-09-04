BEGIN;

-- Catalog 2.0 replacement for the deprecated aggregate guards introduced by
-- 20260904000200. Re-emitting each existing definition from the catalog keeps
-- every validation, tenant predicate, idempotency, audit, and concurrency
-- branch byte-for-byte intact; only the required permission argument changes.
DO $permission_alignment$
DECLARE
  target record;
  definition text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('erp.list_certification_types(boolean)'::regprocedure, 'masterData.manage', 'masterData.read'),
      ('erp.list_assignable_certification_types()'::regprocedure, 'operator.manage', 'operator.update'),
      ('erp.command_create_certification_type(jsonb)'::regprocedure, 'masterData.manage', 'masterData.create'),
      ('erp.command_update_certification_type(jsonb)'::regprocedure, 'masterData.manage', 'masterData.update'),
      ('erp.command_set_certification_type_active(jsonb,boolean)'::regprocedure, 'masterData.manage', 'masterData.update'),
      ('erp.command_assign_operator_certification(jsonb)'::regprocedure, 'operator.manage', 'operator.update'),
      ('erp.command_remove_operator_certification(jsonb)'::regprocedure, 'operator.manage', 'operator.update')
    ) AS replacements(function_identity, deprecated_permission, canonical_permission)
  LOOP
    SELECT pg_get_functiondef(target.function_identity) INTO definition;
    IF position(format('erp.require_certification_actor(''%s'')', target.deprecated_permission) IN definition) = 0 THEN
      RAISE EXCEPTION 'certification permission guard not found for %', target.function_identity;
    END IF;

    EXECUTE replace(
      definition,
      format('erp.require_certification_actor(''%s'')', target.deprecated_permission),
      format('erp.require_certification_actor(''%s'')', target.canonical_permission)
    );
  END LOOP;
END
$permission_alignment$;

COMMIT;
