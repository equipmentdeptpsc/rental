BEGIN;
SET search_path=erp,pg_catalog;

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure)
    INTO definition;
  definition:=replace(definition,
    '(SELECT count(*) FROM notification_delivery_attempts WHERE company_id=target_tenant_id)>1',
    '(SELECT count(*) FROM notification_delivery_attempts WHERE company_id=target_tenant_id)>2');
  IF definition NOT LIKE '%notification_delivery_attempts WHERE company_id=target_tenant_id)>2%'
    OR definition LIKE '%notification_delivery_attempts WHERE company_id=target_tenant_id)>1%'
    OR definition NOT LIKE '%DELETE FROM notification_delivery_envelopes e USING notification_outbox n%'
  THEN RAISE EXCEPTION '06400 cleanup attempt expansion did not match the certified 06300 definition' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
END $$;

ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
