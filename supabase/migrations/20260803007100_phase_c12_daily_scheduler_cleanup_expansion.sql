BEGIN;
SET search_path=erp,pg_catalog;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'(SELECT count(*) FROM customer_review_requests WHERE company_id=target_tenant_id)>2','(SELECT count(*) FROM customer_review_requests WHERE company_id=target_tenant_id)>3');
 definition:=replace(definition,'(SELECT count(*) FROM customer_review_outcomes WHERE company_id=target_tenant_id)>2','(SELECT count(*) FROM customer_review_outcomes WHERE company_id=target_tenant_id)>3');
 definition:=replace(definition,'(SELECT count(*) FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>6','(SELECT count(*) FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>2');
 definition:=replace(definition,'(SELECT count(*) FROM companies WHERE id=target_tenant_id)>1',
  '(SELECT count(*) FROM companies WHERE id=target_tenant_id)>1
    OR (SELECT count(*) FROM system_principals WHERE company_id=target_tenant_id)>1
    OR (SELECT count(*) FROM system_principal_permissions p JOIN system_principals s ON s.id=p.principal_id WHERE s.company_id=target_tenant_id)>1');
 definition:=replace(definition,'(SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id)>3',
  '(SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id)>6
    OR EXISTS(SELECT 1 FROM notification_outbox WHERE company_id=target_tenant_id AND notification_type NOT IN(''CUSTOMER_GROUPED_REVIEW_REQUESTED'',''CUSTOMER_ACKNOWLEDGED'',''CUSTOMER_CORRECTION_CONFIRMED'',''CUSTOMER_CORRECTION_WORK_ITEM''))
    OR (SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id AND notification_type=''CUSTOMER_GROUPED_REVIEW_REQUESTED'')>2
    OR (SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id AND notification_type=''CUSTOMER_ACKNOWLEDGED'')>2
    OR (SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id AND notification_type=''CUSTOMER_CORRECTION_CONFIRMED'')>1
    OR (SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id AND notification_type=''CUSTOMER_CORRECTION_WORK_ITEM'')>1
    OR (SELECT count(*) FROM notification_delivery_envelopes e JOIN notification_outbox n ON n.id=e.notification_id WHERE n.company_id=target_tenant_id)>2
    OR EXISTS(SELECT 1 FROM notification_delivery_envelopes e JOIN notification_outbox n ON n.id=e.notification_id WHERE n.company_id=target_tenant_id AND n.notification_type<>''CUSTOMER_GROUPED_REVIEW_REQUESTED'')');
 IF definition NOT LIKE '%customer_review_requests WHERE company_id=target_tenant_id)>3%'
  OR definition NOT LIKE '%customer_review_outcomes WHERE company_id=target_tenant_id)>3%'
  OR definition NOT LIKE '%notification_outbox WHERE company_id=target_tenant_id)>6%'
  OR definition NOT LIKE '%notification_type NOT IN(''CUSTOMER_GROUPED_REVIEW_REQUESTED''%'
  OR definition NOT LIKE '%daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>2%'
  OR definition NOT LIKE '%notification_delivery_envelopes e JOIN notification_outbox n%target_tenant_id)>2%'
  OR definition NOT LIKE '%system_principals WHERE company_id=target_tenant_id)>1%'
 THEN RAISE EXCEPTION '07100 exact scheduler cleanup expansion did not match installed 07000 boundary' USING ERRCODE='55000';END IF;
 EXECUTE definition;
END $$;
ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) IS 'Owner-only exact cleanup for the bounded C12 daily scheduler live certification: three requests, three outcomes, one correction, two batches, six items, two scheduler groups, six allowlisted notification intents, two grouped envelopes, and two delivery attempts.';
COMMIT;
