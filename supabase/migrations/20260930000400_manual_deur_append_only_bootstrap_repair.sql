BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A correction never rewrites historical event evidence.  This relation makes
-- a later immutable replacement event authoritative for the effective timeline.
CREATE TABLE erp.deur_event_supersessions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  deur_id text NOT NULL REFERENCES erp.deurs(id) ON DELETE RESTRICT,
  original_event_id text NOT NULL REFERENCES erp.deur_events(id) ON DELETE RESTRICT,
  replacement_event_id text NOT NULL REFERENCES erp.deur_events(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (reason_code='MANUAL_CORRECTION_BOOTSTRAP_OCCURRENCE'),
  actor_id text NOT NULL,
  command_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT erp.deur_operational_clock(),
  CHECK (original_event_id<>replacement_event_id),
  UNIQUE (original_event_id),
  UNIQUE (replacement_event_id),
  UNIQUE (company_id,command_id),
  UNIQUE (company_id,idempotency_key)
);
ALTER TABLE erp.deur_event_supersessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY deur_event_supersessions_select_same_company ON erp.deur_event_supersessions
  FOR SELECT TO authenticated USING (company_id=erp.current_company_id());
CREATE FUNCTION erp.validate_deur_event_supersession_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE original_event erp.deur_events%ROWTYPE; replacement_event erp.deur_events%ROWTYPE;
BEGIN
  SELECT * INTO original_event FROM erp.deur_events WHERE id=NEW.original_event_id FOR KEY SHARE;
  SELECT * INTO replacement_event FROM erp.deur_events WHERE id=NEW.replacement_event_id FOR KEY SHARE;
  IF original_event.id IS NULL OR replacement_event.id IS NULL
     OR original_event.company_id<>NEW.company_id OR replacement_event.company_id<>NEW.company_id
     OR original_event.deur_id<>NEW.deur_id OR replacement_event.deur_id<>NEW.deur_id
     OR original_event.deur_id<>replacement_event.deur_id THEN
    RAISE EXCEPTION 'DEUR event supersession scope mismatch' USING ERRCODE='23514';
  END IF;
  -- This initial capability intentionally permits no replacement chains.
  IF EXISTS(SELECT 1 FROM erp.deur_event_supersessions link
    WHERE link.replacement_event_id=NEW.original_event_id
       OR link.original_event_id=NEW.replacement_event_id) THEN
    RAISE EXCEPTION 'DEUR event supersession chaining is not supported' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deur_event_supersessions_validate_scope BEFORE INSERT ON erp.deur_event_supersessions
  FOR EACH ROW EXECUTE FUNCTION erp.validate_deur_event_supersession_scope();
CREATE TRIGGER deur_event_supersessions_immutable BEFORE UPDATE OR DELETE ON erp.deur_event_supersessions
  FOR EACH ROW EXECUTE FUNCTION erp.reject_immutable_change();
REVOKE ALL ON erp.deur_event_supersessions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON erp.deur_event_supersessions TO authenticated;
CREATE FUNCTION erp.effective_deur_events(target_deur_id text)
RETURNS SETOF erp.deur_events LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,pg_catalog AS $$
  SELECT event_record.* FROM erp.deur_events event_record
  WHERE event_record.deur_id=target_deur_id
    AND NOT EXISTS(SELECT 1 FROM erp.deur_event_supersessions link
      WHERE link.original_event_id=event_record.id);
$$;
REVOKE ALL ON FUNCTION erp.effective_deur_events(text) FROM PUBLIC,anon,authenticated,service_role;
-- Keep the canonical validator's rules intact; replace only its source of
-- operational event facts with the one effective-event relation.
DO $$
DECLARE definition text; function_oid oid;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='validate_manual_deur_physical_timeline'
    AND p.pronargs=1 AND p.proargtypes[0]='erp.deurs'::regtype;
  IF function_oid IS NULL OR position('erp.deur_events' IN definition)=0 THEN
    RAISE EXCEPTION 'expected raw physical timeline validator is unavailable';
  END IF;
  definition:=replace(definition,'FROM erp.deur_events e','FROM erp.effective_deur_events(target.id) e');
  definition:=replace(definition,'FROM erp.deur_events later_start','FROM erp.effective_deur_events(target.id) later_start');
  IF position('erp.deur_events' IN definition)>0 THEN RAISE EXCEPTION 'physical validator still has a raw event consumer'; END IF;
  EXECUTE definition;
END $$;
-- Submission state must not be determined by a superseded raw event.
DO $$
DECLARE definition text; function_oid oid;
  raw_guard text := 'OR EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE deur_id=current_deur.id AND is_open AND NOT erp.is_manual_deur_encoding_bootstrap_event(current_deur,event_record))';
  effective_guard text := 'OR EXISTS(SELECT 1 FROM erp.effective_deur_events(current_deur.id) event_record WHERE is_open AND NOT erp.is_manual_deur_encoding_bootstrap_event(current_deur,event_record))';
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_submit_deur' AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL OR position(raw_guard IN definition)=0 THEN RAISE EXCEPTION 'expected raw submit open-event guard is unavailable'; END IF;
  definition:=replace(definition,raw_guard,effective_guard); EXECUTE definition;
END $$;
-- The replacement remains an encoding bootstrap, while its superseded source
-- remains available through the raw immutable history relation.
CREATE OR REPLACE FUNCTION erp.is_manual_deur_encoding_bootstrap_event(target erp.deurs,candidate erp.deur_events)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT target.creation_source='MANUAL_WEB' AND candidate.deur_id=target.id AND candidate.source='manual-web'
    AND candidate.activity_type='shift' AND candidate.action='start' AND candidate.is_open
    AND (
      (candidate.sequence=1 AND candidate.occurred_at=target.created_at AND candidate.server_accepted_at=target.created_at)
      OR EXISTS(SELECT 1 FROM erp.deur_event_supersessions link JOIN erp.deur_events original_event
        ON original_event.id=link.original_event_id
        WHERE link.replacement_event_id=candidate.id AND link.deur_id=target.id
          AND original_event.sequence=1 AND original_event.source='manual-web'
          AND original_event.activity_type='shift' AND original_event.action='start' AND original_event.is_open
          AND original_event.occurred_at=target.created_at AND original_event.server_accepted_at=target.created_at)
    );
$$;
-- All canonical timeline computation observes the effective projection; raw
-- event history remains intact for audit and forensic reads.
CREATE OR REPLACE FUNCTION erp.recalculate_deur_event_totals(target_deur_id text)
RETURNS TABLE(shift_minutes integer,operation_minutes integer,idle_minutes integer,standby_minutes integer,meal_break_minutes integer,breakdown_minutes integer)
LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  WITH paired AS (
    SELECT activity_type,action,occurred_at,lead(action) OVER (PARTITION BY activity_type ORDER BY sequence) AS next_action,
      lead(occurred_at) OVER (PARTITION BY activity_type ORDER BY sequence) AS ended_at
    FROM erp.effective_deur_events(target_deur_id)
  ), totals AS (
    SELECT activity_type,coalesce(sum(extract(epoch FROM (ended_at-occurred_at))/60),0)::integer AS minutes
    FROM paired WHERE action='start' AND next_action='end' GROUP BY activity_type
  ) SELECT coalesce(max(minutes) FILTER(WHERE activity_type='shift'),0),coalesce(max(minutes) FILTER(WHERE activity_type='operation'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='idle'),0),coalesce(max(minutes) FILTER(WHERE activity_type='standby'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='mealBreak'),0),coalesce(max(minutes) FILTER(WHERE activity_type='breakdown'),0) FROM totals;
$$;
-- Replace the incompatible in-place update with a scoped append-only command.
-- The existing guards remain in the deployed command; this prepared migration
-- intentionally fails closed if its expected definition has drifted.
DO $$
DECLARE definition text; oid_value oid;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO oid_value,definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_repair_manual_deur_correction_physical_occurrence'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF oid_value IS NULL OR position('UPDATE erp.deur_events' IN definition)=0 THEN
    RAISE EXCEPTION 'expected in-place correction repair definition is unavailable';
  END IF;
  definition:=replace(definition,
    'UPDATE erp.deur_events' || E'\n  SET occurred_at=source_event.occurred_at' || E'\n  WHERE id=target_event.id AND deur_id=target.id;',
    E'SELECT coalesce(max(sequence),0)+1 INTO target_event.sequence FROM erp.deur_events WHERE deur_id=target.id;\n  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)\n  VALUES(extensions.gen_random_uuid()::text,target.id,target_event.activity_type,target_event.action,source_event.occurred_at,target_event.sequence,target_event.source,actor,now_at,target_event.client_created_at,command->>''commandId'',command->>''idempotencyKey'',target_event.device_id,target_event.is_open,tenant) RETURNING * INTO target_event;\n  INSERT INTO erp.deur_event_supersessions(id,company_id,deur_id,original_event_id,replacement_event_id,reason_code,actor_id,command_id,idempotency_key,created_at)\n  VALUES(extensions.gen_random_uuid()::text,tenant,target.id,(SELECT id FROM erp.deur_events WHERE deur_id=target.id AND sequence=1),target_event.id,''MANUAL_CORRECTION_BOOTSTRAP_OCCURRENCE'',actor,command->>''commandId'',command->>''idempotencyKey'',now_at);');
  IF position('deur_event_supersessions' IN definition)=0 THEN RAISE EXCEPTION 'append-only replacement patch failed'; END IF;
  EXECUTE definition;
END $$;
COMMIT;
