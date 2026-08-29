BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

DO $$
DECLARE
  definition text;
  function_name text;
  replacement record;
BEGIN
  FOR replacement IN
    SELECT * FROM (VALUES
      ('erp.command_create_project(jsonb)'::regprocedure, 'project.manage', 'project.create'),
      ('erp.command_create_operator(jsonb)'::regprocedure, 'operator.manage', 'operator.create'),
      ('erp.command_create_assignment(jsonb)'::regprocedure, 'assignment.manage', 'assignment.create'),
      ('erp.command_create_reserved_rental(jsonb)'::regprocedure, 'rental.manage', 'rental.create')
    ) AS mappings(function_name regprocedure, old_permission text, new_permission text)
  LOOP
    SELECT pg_get_functiondef(replacement.function_name) INTO definition;
    IF definition IS NULL OR position(replacement.old_permission IN definition)=0 THEN
      RAISE EXCEPTION 'Expected legacy permission check missing for %', replacement.function_name;
    END IF;
    definition := replace(definition, replacement.old_permission, replacement.new_permission);
    EXECUTE definition;
  END LOOP;
END $$;

COMMIT;
