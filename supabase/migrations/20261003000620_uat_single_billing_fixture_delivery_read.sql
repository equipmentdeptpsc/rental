BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_uat_single_billing_fixture_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
#variable_conflict use_variable
DECLARE tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey'); s erp.uat_single_billing_fixture_scenarios; request_id uuid; notification_count integer; pending_count integer; provider_accepted_count integer; attempt_count integer; sent_count integer;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR scenario_key<>'BILLING_SINGLE_RENTAL_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO s FROM erp.uat_single_billing_fixture_scenarios x WHERE x.company_id=tenant AND x.scenario_key=scenario_key;
  IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
  SELECT r.id INTO request_id FROM erp.customer_review_requests r WHERE r.company_id=tenant AND r.revision_id=s.scenario->>'deurId' ORDER BY r.created_at DESC LIMIT 1;
  SELECT count(*),count(*) FILTER(WHERE n.status='Pending'),count(*) FILTER(WHERE n.status='ProviderAccepted'),count(*) FILTER(WHERE n.sent_at IS NOT NULL) INTO notification_count,pending_count,provider_accepted_count,sent_count FROM erp.notification_outbox n WHERE n.company_id=tenant AND (n.review_request_id=request_id OR n.source_aggregate_id=s.scenario->>'deurId');
  SELECT count(*) INTO attempt_count FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id=tenant AND (n.review_request_id=request_id OR n.source_aggregate_id=s.scenario->>'deurId');
  RETURN jsonb_build_object('success',true,'scenarioKey',scenario_key,'requestId',request_id,'notificationCount',notification_count,'pendingCount',pending_count,'providerAcceptedCount',provider_accepted_count,'providerAttemptCount',attempt_count,'sentCount',sent_count,'emailSent',sent_count>0 OR provider_accepted_count>0);
END $$;
ALTER FUNCTION erp.inspect_uat_single_billing_fixture_delivery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_single_billing_fixture_delivery(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_single_billing_fixture_delivery(jsonb) TO service_role;
COMMIT;
