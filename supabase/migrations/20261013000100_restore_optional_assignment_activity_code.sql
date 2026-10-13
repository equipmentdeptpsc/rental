BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The 20261008000200 create-command replacement accidentally made Activity Code
-- mandatory. The column and amendment command permit an omitted code.
DO $migration$
DECLARE definition text; required_guard text;
BEGIN
 definition=pg_get_functiondef('erp.command_create_assignment(jsonb)'::regprocedure);
 required_guard=$guard$ OR nullif(btrim(command->>'activityCodeId'),'') IS NULL$guard$;
 IF (length(definition)-length(replace(definition,required_guard,'')))<>length(required_guard)
 THEN RAISE EXCEPTION 'Assignment create guard changed; optional Activity Code correction not applied'; END IF;
 EXECUTE replace(definition,required_guard,'');
END $migration$;

COMMIT;
