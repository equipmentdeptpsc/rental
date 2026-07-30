BEGIN;
SET search_path TO erp, public;

CREATE OR REPLACE FUNCTION fill_legacy_command_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='deurs' THEN
    SELECT company_id INTO NEW.company_id FROM rentals WHERE id=NEW.rental_id;
  ELSIF TG_TABLE_NAME='deur_events' THEN
    SELECT company_id INTO NEW.company_id FROM deurs WHERE id=NEW.deur_id;
  ELSIF TG_TABLE_NAME='audit_log' THEN
    NEW.company_id=current_company_id();
  ELSIF TG_TABLE_NAME='deur_command_idempotency' THEN
    SELECT company_id INTO NEW.company_id FROM users WHERE id=NEW.actor_id AND status='active';
  END IF;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company scope is required' USING ERRCODE='23502';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER a_fill_legacy_command_company_id BEFORE INSERT ON deur_command_idempotency
  FOR EACH ROW EXECUTE FUNCTION fill_legacy_command_company_id();

REVOKE ALL ON FUNCTION fill_legacy_command_company_id() FROM PUBLIC,anon,authenticated;

COMMIT;
