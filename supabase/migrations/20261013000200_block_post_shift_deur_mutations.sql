BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Status intentionally remains In Progress until Submit. A shift-end event is
-- therefore the authoritative boundary for further operator mutations.
DO $migration$
DECLARE definition text; anchor text; replacement text; command_name text;
BEGIN
 FOREACH command_name IN ARRAY ARRAY['command_transition_deur_activity','command_complete_deur_shift'] LOOP
  definition=pg_get_functiondef(format('erp.%I(jsonb)',command_name)::regprocedure);
  anchor=$guard$IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;$guard$;
  replacement=anchor||E'\n  IF EXISTS (SELECT 1 FROM erp.deur_events WHERE deur_id=current_deur.id AND activity_type=''shift'' AND action=''end'') THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_TRANSITION''); END IF;';
  IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor)
  THEN RAISE EXCEPTION '% command body changed; shift-end guard not applied',command_name; END IF;
  EXECUTE replace(definition,anchor,replacement);
 END LOOP;

 definition=pg_get_functiondef('erp.command_record_deur_travel_checkpoint(jsonb)'::regprocedure);
 anchor=$guard$IF current_deur.status<>'In Progress' OR odometer<0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;$guard$;
 replacement=anchor||E'\n  IF EXISTS (SELECT 1 FROM erp.deur_events WHERE deur_id=current_deur.id AND activity_type=''shift'' AND action=''end'') THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_TRANSITION''); END IF;';
 IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor)
 THEN RAISE EXCEPTION 'Travel checkpoint command body changed; shift-end guard not applied'; END IF;
 EXECUTE replace(definition,anchor,replacement);

 definition=pg_get_functiondef('erp.command_record_deur_refuel(jsonb)'::regprocedure);
 anchor=$guard$IF target.status<>'In Progress' OR odometer_value<0 OR liters_value<=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;$guard$;
 replacement=anchor||E'\n  IF EXISTS (SELECT 1 FROM erp.deur_events WHERE deur_id=target.id AND activity_type=''shift'' AND action=''end'') THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_TRANSITION''); END IF;';
 IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor)
 THEN RAISE EXCEPTION 'Refuel command body changed; shift-end guard not applied'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $migration$;

COMMIT;
