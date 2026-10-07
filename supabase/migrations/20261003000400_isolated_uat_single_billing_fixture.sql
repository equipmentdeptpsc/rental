BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE IF NOT EXISTS erp.uat_single_billing_fixture_scenarios(
  company_id text NOT NULL REFERENCES erp.companies(id),
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  state text NOT NULL CHECK(state IN('PROVISIONING','READY','FAILED')),
  scenario jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,scenario_key)
);
ALTER TABLE erp.uat_single_billing_fixture_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_single_billing_fixture_scenarios FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION erp.resolve_uat_single_billing_fixture_references(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion');
  cost_row erp.cost_codes; activity_row erp.activity_codes; work_row erp.work_descriptions;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR skey<>'BILLING_SINGLE_RENTAL_V1' OR profile<>'UAT_BILLING_SINGLE_RENTAL_V1'
     OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test'))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO cost_row FROM erp.cost_codes c WHERE c.active AND c.deleted_at IS NULL ORDER BY (c.code LIKE 'UAT%') DESC,c.sort_order,c.code,c.id LIMIT 1;
  SELECT * INTO activity_row FROM erp.activity_codes a WHERE a.active AND a.deleted_at IS NULL ORDER BY (a.code LIKE 'UAT%') DESC,a.sort_order,a.code,a.id LIMIT 1;
  SELECT * INTO work_row FROM erp.work_descriptions w WHERE w.active AND w.deleted_at IS NULL ORDER BY (w.code LIKE 'UAT%') DESC,w.sort_order,w.code,w.id LIMIT 1;
  RETURN jsonb_build_object('success',cost_row.id IS NOT NULL AND activity_row.id IS NOT NULL AND work_row.id IS NOT NULL,
    'code',CASE WHEN cost_row.id IS NULL THEN 'COST_CODE_NOT_FOUND' WHEN activity_row.id IS NULL THEN 'ACTIVITY_CODE_NOT_FOUND' WHEN work_row.id IS NULL THEN 'WORK_DESCRIPTION_NOT_FOUND' ELSE 'OK' END,
    'costCodeId',cost_row.id,'activityCodeId',activity_row.id,'workDescriptionId',work_row.id);
END $$;

CREATE OR REPLACE FUNCTION erp.claim_uat_single_billing_fixture(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); existing erp.uat_single_billing_fixture_scenarios; refs jsonb:=coalesce(command->'references','{}'::jsonb); draft jsonb;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR skey<>'BILLING_SINGLE_RENTAL_V1' OR profile<>'UAT_BILLING_SINGLE_RENTAL_V1'
     OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test'))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':'||skey,0));
  SELECT * INTO existing FROM erp.uat_single_billing_fixture_scenarios WHERE company_id=tenant AND scenario_key=skey FOR UPDATE;
  IF existing.scenario_key IS NOT NULL THEN
    IF existing.profile_version<>profile THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH'); END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
  END IF;
  IF nullif(refs->>'costCodeId','') IS NULL OR nullif(refs->>'activityCodeId','') IS NULL OR nullif(refs->>'workDescriptionId','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','REFERENCE_VALIDATION_FAILED'); END IF;
  draft:=jsonb_build_object('customerId',gen_random_uuid(),'projectId',gen_random_uuid(),'operatorId',gen_random_uuid(),
    'equipmentId',gen_random_uuid(),'assignmentId',gen_random_uuid(),'rentalId',gen_random_uuid(),'lineId',gen_random_uuid(),
    'deurId',gen_random_uuid(),'workDate','2026-09-30','costCodeId',refs->>'costCodeId','activityCodeId',refs->>'activityCodeId','workDescriptionId',refs->>'workDescriptionId');
  INSERT INTO erp.uat_single_billing_fixture_scenarios(company_id,scenario_key,profile_version,state,scenario) VALUES(tenant,skey,profile,'PROVISIONING',draft);
  RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',draft);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_uat_single_billing_fixture(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); s erp.uat_single_billing_fixture_scenarios; v jsonb; target erp.deurs; request_count integer; ack_count integer;
BEGIN
  SELECT * INTO s FROM erp.uat_single_billing_fixture_scenarios WHERE company_id=tenant AND scenario_key=skey FOR UPDATE;
  IF s.scenario_key IS NULL OR s.profile_version<>'UAT_BILLING_SINGLE_RENTAL_V1' OR s.state<>'PROVISIONING' THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
  v:=s.scenario; SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND id=v->>'deurId';
  SELECT count(*) INTO request_count FROM erp.customer_review_requests WHERE company_id=tenant AND revision_id=target.id;
  SELECT count(*) INTO ack_count FROM erp.customer_review_outcomes WHERE company_id=tenant AND revision_id=target.id AND action='ACKNOWLEDGE';
  IF target.id IS NULL OR target.status<>'Acknowledged' OR request_count<>1 OR ack_count<>1
     OR (SELECT count(*) FROM erp.rentals WHERE company_id=tenant AND id=v->>'rentalId')<>1
     OR (SELECT count(*) FROM erp.rental_equipment_lines WHERE company_id=tenant AND id=v->>'lineId')<>1
  THEN RETURN jsonb_build_object('success',false,'code','FIXTURE_INCOMPLETE'); END IF;
  UPDATE erp.uat_single_billing_fixture_scenarios SET state='READY',updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=skey;
  RETURN jsonb_build_object('success',true,'state','READY','scenario',v);
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_single_billing_fixture(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); s erp.uat_single_billing_fixture_scenarios; v jsonb; target erp.deurs; rental_count integer; line_count integer; review_count integer; ack_count integer; operation_minutes integer; event_count integer; billing jsonb;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR skey<>'BILLING_SINGLE_RENTAL_V1' OR profile<>'UAT_BILLING_SINGLE_RENTAL_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO s FROM erp.uat_single_billing_fixture_scenarios WHERE company_id=tenant AND scenario_key=skey;
  IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
  v:=s.scenario; SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND id=v->>'deurId';
  SELECT count(*) INTO rental_count FROM erp.rentals WHERE company_id=tenant AND id=v->>'rentalId';
  SELECT count(*) INTO line_count FROM erp.rental_equipment_lines WHERE company_id=tenant AND id=v->>'lineId';
  SELECT count(*) INTO review_count FROM erp.customer_review_requests WHERE company_id=tenant AND revision_id=v->>'deurId';
  SELECT count(*) INTO ack_count FROM erp.customer_review_outcomes WHERE company_id=tenant AND revision_id=v->>'deurId' AND action='ACKNOWLEDGE';
  SELECT coalesce(sum(CASE WHEN activity_type='operation' AND action='end' THEN extract(epoch FROM (occurred_at-(SELECT max(e2.occurred_at) FROM erp.deur_events e2 WHERE e2.deur_id=e.deur_id AND e2.activity_type='operation' AND e2.action='start' AND e2.sequence<e.sequence)) / 60)::integer ELSE 0 END),0),count(*) INTO operation_minutes,event_count FROM erp.deur_events e WHERE e.deur_id=v->>'deurId';
  billing:=CASE WHEN target.id IS NULL THEN jsonb_build_object('success',false,'code','NOT_FOUND') ELSE erp.calculate_deur_billing_evidence(target.id,tenant) END;
  RETURN jsonb_build_object('success',true,'state',s.state,'scenarioKey',skey,'profileVersion',profile,'customerId',v->>'customerId','projectId',v->>'projectId','operatorId',v->>'operatorId','equipmentId',v->>'equipmentId','assignmentId',v->>'assignmentId','rentalId',v->>'rentalId','rentalEquipmentLineId',v->>'lineId','deurId',v->>'deurId','workDate',v->>'workDate','counts',jsonb_build_object('customers',(SELECT count(*) FROM erp.customers WHERE company_id=tenant AND id=v->>'customerId'),'projects',(SELECT count(*) FROM erp.projects WHERE company_id=tenant AND id=v->>'projectId'),'operators',(SELECT count(*) FROM erp.operators WHERE company_id=tenant AND id=v->>'operatorId'),'equipment',(SELECT count(*) FROM erp.equipment WHERE company_id=tenant AND id=v->>'equipmentId'),'assignments',(SELECT count(*) FROM erp.assignments WHERE company_id=tenant AND id=v->>'assignmentId'),'rentals',rental_count,'lines',line_count,'deurs',(SELECT count(*) FROM erp.deurs WHERE company_id=tenant AND id=v->>'deurId'),'events',event_count,'reviews',review_count,'acknowledgements',ack_count,'billingStatements',(SELECT count(*) FROM erp.billing_statements bs WHERE bs.company_id=tenant AND bs.rental_id=v->>'rentalId'),'collections',(SELECT count(*) FROM erp.collections c JOIN erp.billing_statements bs ON bs.id=c.billing_statement_id WHERE bs.company_id=tenant AND bs.rental_id=v->>'rentalId')),'rentalStatus',(SELECT status FROM erp.rentals WHERE company_id=tenant AND id=v->>'rentalId'),'deurStatus',target.status,'operationMinutes',operation_minutes,'positiveBillableEvidence',coalesce(operation_minutes,0)>0,'billingEligibility',billing,'notificationCount',(SELECT count(*) FROM erp.notification_outbox n WHERE n.company_id=tenant AND n.review_request_id IN(SELECT id FROM erp.customer_review_requests WHERE revision_id=v->>'deurId')));
END $$;

ALTER FUNCTION erp.resolve_uat_single_billing_fixture_references(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.claim_uat_single_billing_fixture(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_uat_single_billing_fixture(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_single_billing_fixture(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_single_billing_fixture_references(jsonb),erp.claim_uat_single_billing_fixture(jsonb),erp.complete_uat_single_billing_fixture(jsonb),erp.inspect_uat_single_billing_fixture(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_uat_single_billing_fixture_references(jsonb),erp.claim_uat_single_billing_fixture(jsonb),erp.complete_uat_single_billing_fixture(jsonb),erp.inspect_uat_single_billing_fixture(jsonb) TO service_role;
COMMIT;
