BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A raw correction replacement must not duplicate the still-retained open
-- bootstrap row.  The replacement represents historical physical evidence
-- whose matching shift/end is already present, so it is closed on insertion.
-- Its bootstrap classification is retained through its immutable supersession
-- relation rather than through a live is_open flag.
CREATE OR REPLACE FUNCTION erp.is_manual_deur_encoding_bootstrap_event(target erp.deurs,candidate erp.deur_events)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT target.creation_source='MANUAL_WEB' AND candidate.deur_id=target.id AND candidate.source='manual-web'
    AND candidate.activity_type='shift' AND candidate.action='start'
    AND (
      (candidate.sequence=1 AND candidate.is_open
        AND candidate.occurred_at=target.created_at AND candidate.server_accepted_at=target.created_at)
      OR EXISTS(SELECT 1 FROM erp.deur_event_supersessions link JOIN erp.deur_events original_event
        ON original_event.id=link.original_event_id
        WHERE link.replacement_event_id=candidate.id AND link.deur_id=target.id
          AND original_event.sequence=1 AND original_event.source='manual-web'
          AND original_event.activity_type='shift' AND original_event.action='start' AND original_event.is_open
          AND original_event.occurred_at=target.created_at AND original_event.server_accepted_at=target.created_at)
    );
$$;
DO $$
DECLARE definition text; function_oid oid;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_repair_manual_deur_correction_physical_occurrence'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL
     OR position('target_event.device_id,target_event.is_open,tenant) RETURNING * INTO target_event;' IN definition)=0 THEN
    RAISE EXCEPTION 'expected append-only correction repair insertion is unavailable';
  END IF;
  definition:=replace(definition,
    'target_event.device_id,target_event.is_open,tenant) RETURNING * INTO target_event;',
    'target_event.device_id,false,tenant) RETURNING * INTO target_event;');
  IF position('target_event.device_id,target_event.is_open,tenant) RETURNING * INTO target_event;' IN definition)>0
     OR position('target_event.device_id,false,tenant) RETURNING * INTO target_event;' IN definition)=0 THEN
    RAISE EXCEPTION 'append-only correction repair open-shift state patch failed';
  END IF;
  EXECUTE definition;
END $$;
COMMIT;
