BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION fill_legacy_command_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='deurs' THEN
    SELECT company_id INTO NEW.company_id FROM rentals WHERE id=NEW.rental_id;
  ELSIF TG_TABLE_NAME='deur_events' THEN
    SELECT company_id INTO NEW.company_id FROM deurs WHERE id=NEW.deur_id;
  ELSIF TG_TABLE_NAME='audit_log' THEN
    NEW.company_id=current_company_id();
  END IF;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company scope is required' USING ERRCODE='23502';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER a_fill_legacy_command_company_id BEFORE INSERT ON deurs
  FOR EACH ROW EXECUTE FUNCTION fill_legacy_command_company_id();
CREATE TRIGGER a_fill_legacy_command_company_id BEFORE INSERT ON deur_events
  FOR EACH ROW EXECUTE FUNCTION fill_legacy_command_company_id();
CREATE TRIGGER a_fill_legacy_command_company_id BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fill_legacy_command_company_id();

REVOKE ALL ON FUNCTION fill_legacy_command_company_id() FROM PUBLIC,anon,authenticated;

COMMIT;
