BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE IF NOT EXISTS erp.uat_deur_turnover_domain_scenarios(
  company_id text NOT NULL REFERENCES erp.companies(id),
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  state text NOT NULL CHECK(state IN('PROVISIONING','DOMAIN_READY','FAILED')),
  scenario jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,scenario_key)
);
ALTER TABLE erp.uat_deur_turnover_domain_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_deur_turnover_domain_scenarios FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION erp.claim_uat_deur_turnover_domain_scenario(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); existing erp.uat_deur_turnover_domain_scenarios; draft jsonb;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR skey<>'DEUR-TURNOVER-RUNTIME-CERT-2026-08-31' OR profile<>'UAT_DEUR_TURNOVER_RUNTIME_V1' OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':'||skey,0));
 SELECT * INTO existing FROM erp.uat_deur_turnover_domain_scenarios WHERE company_id=tenant AND scenario_key=skey FOR UPDATE;
 IF existing.scenario_key IS NOT NULL THEN IF existing.profile_version<>profile THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH'); END IF; RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario); END IF;
 draft=jsonb_build_object('projectId',gen_random_uuid(),'customerId',gen_random_uuid(),'rentalId',gen_random_uuid(),'lineId',gen_random_uuid(),'equipmentId',gen_random_uuid(),'assignmentId',gen_random_uuid(),'primaryOperatorId',gen_random_uuid(),'relieverOperatorId',gen_random_uuid());
 INSERT INTO erp.uat_deur_turnover_domain_scenarios(company_id,scenario_key,profile_version,state,scenario) VALUES(tenant,skey,profile,'PROVISIONING',draft);
 RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',draft);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_uat_deur_turnover_domain_scenario(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); existing erp.uat_deur_turnover_domain_scenarios;
BEGIN
 SELECT * INTO existing FROM erp.uat_deur_turnover_domain_scenarios WHERE company_id=tenant AND scenario_key=skey FOR UPDATE;
 IF existing.scenario_key IS NULL OR existing.state<>'PROVISIONING' THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
 UPDATE erp.uat_deur_turnover_domain_scenarios SET state='DOMAIN_READY',updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=skey;
 RETURN jsonb_build_object('success',true,'state','DOMAIN_READY','scenario',existing.scenario);
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); s erp.uat_deur_turnover_domain_scenarios; v jsonb;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR skey<>'DEUR-TURNOVER-RUNTIME-CERT-2026-08-31' OR profile<>'UAT_DEUR_TURNOVER_RUNTIME_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO s FROM erp.uat_deur_turnover_domain_scenarios WHERE company_id=tenant AND scenario_key=skey;
 IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
 v:=s.scenario;
 RETURN jsonb_build_object('success',true,'state',s.state,'scenarioKey',skey,'profileVersion',profile,'projectId',v->>'projectId','customerId',v->>'customerId','rentalId',v->>'rentalId','rentalEquipmentLineId',v->>'lineId','equipmentId',v->>'equipmentId','assignmentId',v->>'assignmentId','primaryOperatorId',v->>'primaryOperatorId','relieverOperatorId',v->>'relieverOperatorId','primaryOperatorActive',EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=(v->>'primaryOperatorId') AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL),'relieverOperatorActive',EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=(v->>'relieverOperatorId') AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL),'assignmentOperatorId',(SELECT a.operator_id FROM erp.assignments a WHERE a.id=(v->>'assignmentId') AND a.company_id=tenant),'primaryLinkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=(v->>'primaryOperatorId') AND u.status='active'),'relieverLinkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=(v->>'relieverOperatorId') AND u.status='active'),'scenarioDeurCount',(SELECT count(*) FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=(v->>'lineId')),'pendingTurnoverCount',0,'acceptedTurnoverCount',0,'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,'returnMutationPresent',false,'crossOperatorExposure','[]'::jsonb);
END $$;

ALTER FUNCTION erp.claim_uat_deur_turnover_domain_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_uat_deur_turnover_domain_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.claim_uat_deur_turnover_domain_scenario(jsonb),erp.complete_uat_deur_turnover_domain_scenario(jsonb),erp.inspect_uat_deur_turnover_domain_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.claim_uat_deur_turnover_domain_scenario(jsonb),erp.complete_uat_deur_turnover_domain_scenario(jsonb),erp.inspect_uat_deur_turnover_domain_scenario(jsonb) TO service_role;
COMMIT;
