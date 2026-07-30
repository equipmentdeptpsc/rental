BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION protect_deur_event_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE'
     AND OLD.is_open=true AND NEW.is_open=false
     AND (to_jsonb(NEW)-'is_open')=(to_jsonb(OLD)-'is_open') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'immutable historical record cannot be changed' USING ERRCODE='55000';
END $$;

DROP TRIGGER deur_events_immutable ON deur_events;
CREATE TRIGGER deur_events_immutable BEFORE UPDATE OR DELETE ON deur_events
  FOR EACH ROW EXECUTE FUNCTION protect_deur_event_history();

REVOKE ALL ON FUNCTION protect_deur_event_history() FROM PUBLIC,anon,authenticated;

COMMIT;
