BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Patch the canonical commands in place so the customer-aware create wrapper,
-- existing grants, transaction locks, idempotency, lineage, and audit stay intact.
DO $migration$
DECLARE definition text; anchor text;
BEGIN
 definition=pg_get_functiondef('erp.command_create_assignment(jsonb)'::regprocedure);
 anchor=$anchor$payload_hash=idem->>'payloadHash';$anchor$;
 IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor)
 THEN RAISE EXCEPTION 'Assignment create command body changed; date guard not applied'; END IF;
 definition=replace(definition,anchor,$replacement$payload_hash=idem->>'payloadHash';
 IF assigned_on<(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date
 THEN RETURN jsonb_build_object('success',false,'code','ASSIGNMENT_START_DATE_IN_PAST'); END IF;$replacement$);
 EXECUTE definition;

 definition=pg_get_functiondef('erp.command_revise_assignment(jsonb)'::regprocedure);
 anchor=$anchor$IF target.row_version<>expected_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version); END IF;$anchor$;
 IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor)
 THEN RAISE EXCEPTION 'Assignment revision command body changed; date guard not applied'; END IF;
 definition=replace(definition,anchor,$replacement$IF target.row_version<>expected_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version); END IF;
 IF assigned_on IS DISTINCT FROM target.assigned_date
    AND assigned_on<(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date
 THEN RETURN jsonb_build_object('success',false,'code','ASSIGNMENT_START_DATE_IN_PAST'); END IF;$replacement$);
 EXECUTE definition;
END $migration$;

COMMIT;
