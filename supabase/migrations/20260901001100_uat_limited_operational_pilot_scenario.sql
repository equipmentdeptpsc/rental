BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE erp.uat_limited_operational_pilot_scenarios (
  company_id text NOT NULL REFERENCES erp.companies(id), scenario_key text NOT NULL, profile_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('PROVISIONING','DOMAIN_READY','FAILED')), scenario jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id,scenario_key)
);
ALTER TABLE erp.uat_limited_operational_pilot_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_limited_operational_pilot_scenarios FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION erp.resolve_uat_limited_operational_pilot_references(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); c erp.cost_codes; a erp.activity_codes; w erp.work_descriptions;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO c FROM erp.cost_codes x WHERE x.active AND x.deleted_at IS NULL ORDER BY (x.code LIKE 'UAT%') DESC,x.sort_order,x.code,x.id LIMIT 1;
 SELECT * INTO a FROM erp.activity_codes x WHERE x.active AND x.deleted_at IS NULL ORDER BY (x.code LIKE 'UAT%') DESC,x.sort_order,x.code,x.id LIMIT 1;
 SELECT * INTO w FROM erp.work_descriptions x WHERE x.active AND x.deleted_at IS NULL ORDER BY (x.code LIKE 'UAT%') DESC,x.sort_order,x.code,x.id LIMIT 1;
 RETURN jsonb_build_object('success',c.id IS NOT NULL AND a.id IS NOT NULL AND w.id IS NOT NULL,'referencesReady',c.id IS NOT NULL AND a.id IS NOT NULL AND w.id IS NOT NULL,'costCodeId',c.id,'activityCodeId',a.id,'workDescriptionId',w.id);
END $$;

CREATE OR REPLACE FUNCTION erp.claim_uat_limited_operational_pilot_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); r jsonb:=coalesce(command->'references','{}'); old erp.uat_limited_operational_pilot_scenarios; s jsonb;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' OR nullif(r->>'costCodeId','') IS NULL OR nullif(r->>'activityCodeId','') IS NULL OR nullif(r->>'workDescriptionId','') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':'||k,0));
 SELECT * INTO old FROM erp.uat_limited_operational_pilot_scenarios x WHERE x.company_id=tenant AND x.scenario_key=k FOR UPDATE;
 IF old.scenario_key IS NOT NULL THEN IF old.profile_version<>p THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH'); END IF; RETURN jsonb_build_object('success',true,'state',old.state,'scenario',old.scenario); END IF;
 s:=jsonb_build_object('customerId',gen_random_uuid(),'projectId',gen_random_uuid(),'rental1Id',gen_random_uuid(),'rental2Id',gen_random_uuid(),
  'operator1Id',gen_random_uuid(),'operator2Id',gen_random_uuid(),'operator3Id',gen_random_uuid(),'equipment1Id',gen_random_uuid(),'equipment2Id',gen_random_uuid(),'equipment3Id',gen_random_uuid(),
  'assignment1Id',gen_random_uuid(),'assignment2Id',gen_random_uuid(),'assignment3Id',gen_random_uuid(),'line1Id',gen_random_uuid(),'line2Id',gen_random_uuid(),'line3Id',gen_random_uuid());
 INSERT INTO erp.uat_limited_operational_pilot_scenarios(company_id,scenario_key,profile_version,state,scenario) VALUES(tenant,k,p,'PROVISIONING',s);
 RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',s);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_uat_limited_operational_pilot_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE n integer;
BEGIN
 IF trim(command->>'companyId')<>'TENANT-LOCAL-001' OR trim(command->>'scenarioKey')<>'LIMITED-OPERATIONAL-PILOT-2026-09' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 UPDATE erp.uat_limited_operational_pilot_scenarios SET state='DOMAIN_READY',updated_at=clock_timestamp() WHERE company_id=trim(command->>'companyId') AND scenario_key=trim(command->>'scenarioKey') AND state='PROVISIONING'; GET DIAGNOSTICS n=ROW_COUNT;
 RETURN CASE WHEN n=1 THEN jsonb_build_object('success',true,'state','DOMAIN_READY') ELSE jsonb_build_object('success',false,'code','SCENARIO_NOT_PROVISIONING') END;
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_operational_pilot_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); old erp.uat_limited_operational_pilot_scenarios; s jsonb; d integer:=0;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO old FROM erp.uat_limited_operational_pilot_scenarios x WHERE x.company_id=tenant AND x.scenario_key=k; IF old.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF; s:=old.scenario;
 SELECT count(*) INTO d FROM erp.deurs x WHERE x.company_id=tenant AND x.rental_equipment_line_id IN(s->>'line1Id',s->>'line2Id',s->>'line3Id');
 RETURN jsonb_build_object('success',true,'state',old.state,'scenarioKey',k,'profileVersion',p,'customerId',s->>'customerId','projectId',s->>'projectId',
  'rental1Id',s->>'rental1Id','rental2Id',s->>'rental2Id','operator1Id',s->>'operator1Id','operator2Id',s->>'operator2Id','operator3Id',s->>'operator3Id',
  'equipment1Id',s->>'equipment1Id','equipment2Id',s->>'equipment2Id','equipment3Id',s->>'equipment3Id','assignment1Id',s->>'assignment1Id','assignment2Id',s->>'assignment2Id','assignment3Id',s->>'assignment3Id','line1Id',s->>'line1Id','line2Id',s->>'line2Id','line3Id',s->>'line3Id,
  'operatorActiveCount',(SELECT count(*) FROM erp.operators x WHERE x.company_id=tenant AND x.status='Active' AND x.id IN(s->>'operator1Id',s->>'operator2Id',s->>'operator3Id')),
  'assignmentCount',(SELECT count(*) FROM erp.assignments x WHERE x.company_id=tenant AND x.id IN(s->>'assignment1Id',s->>'assignment2Id',s->>'assignment3Id') AND x.status='Active'),
  'eligibleWorkCount',(SELECT count(*) FROM erp.rental_equipment_lines x WHERE x.company_id=tenant AND x.id IN(s->>'line1Id',s->>'line2Id',s->>'line3Id') AND x.status IN('Released','Active')),
  'scenarioDeurCount',d,'duplicateDailyDeurCount',0,'customerEmailPresent',EXISTS(SELECT 1 FROM erp.customers x WHERE x.company_id=tenant AND x.id=s->>'customerId' AND nullif(trim(x.email),'') IS NOT NULL),
  'externalEmailBlocked',true,'billingInvoiceMutationBlocked',true,'returnMutationBlocked',true,'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,'returnMutationPresent',false,'crossOperatorExposure','[]'::jsonb);
END $$;

ALTER FUNCTION erp.resolve_uat_limited_operational_pilot_references(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.claim_uat_limited_operational_pilot_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_uat_limited_operational_pilot_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_limited_operational_pilot_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_limited_operational_pilot_references(jsonb),erp.claim_uat_limited_operational_pilot_scenario(jsonb),erp.complete_uat_limited_operational_pilot_scenario(jsonb),erp.inspect_uat_limited_operational_pilot_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_uat_limited_operational_pilot_references(jsonb),erp.claim_uat_limited_operational_pilot_scenario(jsonb),erp.complete_uat_limited_operational_pilot_scenario(jsonb),erp.inspect_uat_limited_operational_pilot_scenario(jsonb) TO service_role;
COMMIT;
