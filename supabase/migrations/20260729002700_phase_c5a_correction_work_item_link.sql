BEGIN;
SET search_path TO erp, pg_catalog;

CREATE FUNCTION resolve_customer_correction_work_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  IF NEW.previous_revision_id IS NOT NULL THEN
    UPDATE customer_correction_requests
    SET status='Resolved',resulting_revision_id=NEW.id,resolved_at=clock_timestamp()
    WHERE company_id=NEW.company_id
      AND source_revision_id=NEW.previous_revision_id
      AND status='Open';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER resolve_customer_correction_after_revision
AFTER INSERT ON deurs
FOR EACH ROW EXECUTE FUNCTION resolve_customer_correction_work_item();

REVOKE ALL ON FUNCTION resolve_customer_correction_work_item()
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION resolve_customer_correction_work_item() IS
  'Links an open C5A customer correction work item to the canonical resulting DEUR revision.';

COMMIT;
