BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.acknowledge_uat_single_billing_fixture_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
#variable_conflict use_variable
DECLARE tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey'); deur_id text:=trim(command->>'deurId'); request_row erp.customer_review_requests; target erp.deurs; scenario_row erp.uat_single_billing_fixture_scenarios; now_at timestamptz:=clock_timestamp();
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR scenario_key<>'BILLING_SINGLE_RENTAL_V1' OR nullif(deur_id,'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO scenario_row FROM erp.uat_single_billing_fixture_scenarios s WHERE s.company_id=tenant AND s.scenario_key=scenario_key FOR SHARE;
  IF scenario_row.scenario_key IS NULL OR scenario_row.state<>'PROVISIONING' OR scenario_row.scenario->>'deurId'<>deur_id THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
  SELECT * INTO target FROM erp.deurs d WHERE d.company_id=tenant AND d.id=deur_id FOR UPDATE;
  SELECT * INTO request_row FROM erp.customer_review_requests r WHERE r.company_id=tenant AND r.revision_id=deur_id ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
  IF target.id IS NULL OR request_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','REVIEW_NOT_FOUND'); END IF;
  IF target.status='Acknowledged' AND EXISTS(SELECT 1 FROM erp.customer_review_outcomes o WHERE o.company_id=tenant AND o.review_request_id=request_row.id AND o.action='ACKNOWLEDGE') THEN RETURN jsonb_build_object('success',true,'disposition','REPLAYED','reviewStatus','Acknowledged'); END IF;
  IF target.status<>'Submitted' OR request_row.status<>'Pending' OR request_row.revoked_at IS NOT NULL OR request_row.superseded_at IS NOT NULL OR request_row.expires_at<=now_at OR NOT ('ACKNOWLEDGE'=ANY(request_row.permitted_actions)) THEN RETURN jsonb_build_object('success',false,'code','REVIEW_NOT_ACKNOWLEDGEABLE'); END IF;
  INSERT INTO erp.customer_review_outcomes(company_id,review_request_id,rental_id,deur_id,revision_id,action,customer_reason,recipient_name,occurred_at)
  VALUES(tenant,request_row.id,request_row.rental_id,request_row.deur_id,request_row.revision_id,'ACKNOWLEDGE',NULL,request_row.recipient_name,now_at);
  UPDATE erp.deurs SET status='Acknowledged',acknowledged_at=now_at,acknowledged_by=request_row.recipient_name,acknowledgement_remarks=NULL WHERE id=target.id;
  INSERT INTO erp.deur_review_history(id,deur_id,action,actor_name,occurred_at,company_id) VALUES(extensions.gen_random_uuid()::text,target.id,'acknowledged',request_row.recipient_name,now_at,tenant);
  UPDATE erp.customer_review_requests SET status='Acknowledged',consumed_at=now_at,row_version=row_version+1 WHERE id=request_row.id;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW',request_row.id::text,'ACKNOWLEDGE',NULL,now_at,command->>'commandId',jsonb_build_object('revisionId',request_row.revision_id,'source','UAT_SINGLE_BILLING_FIXTURE'));
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','reviewStatus','Acknowledged');
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',true,'disposition','REPLAYED','reviewStatus','Acknowledged');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','HELPER_ERROR','sqlstate',SQLSTATE);
END $$;

ALTER FUNCTION erp.acknowledge_uat_single_billing_fixture_review(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.acknowledge_uat_single_billing_fixture_review(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.acknowledge_uat_single_billing_fixture_review(jsonb) TO service_role;
COMMIT;
