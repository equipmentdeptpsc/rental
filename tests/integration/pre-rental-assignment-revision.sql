\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-REV-TEST','ART','Assignment Revision',true,'test'),('TENANT-REV-OTHER','ARO','Other Assignment Revision',true,'test');
INSERT INTO auth.users(id) VALUES('99100000-0000-4000-8000-000000000001'),('99100000-0000-4000-8000-000000000002');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('99100000-0000-4000-8000-000000000001','revision.admin','Revision Admin','revision.admin@example.test','active','TENANT-REV-TEST'),
 ('99100000-0000-4000-8000-000000000002','revision.viewer','Revision Viewer','revision.viewer@example.test','active','TENANT-REV-TEST');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99100000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99100000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='read-only-auditor';
INSERT INTO erp.projects(id,name,active,company_id) VALUES('PROJECT-REV-A','Project A',true,'TENANT-REV-TEST'),('PROJECT-REV-B','Project B',true,'TENANT-REV-TEST'),('PROJECT-REV-OTHER','Other Tenant Project',true,'TENANT-REV-OTHER');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('OPERATOR-REV-A','Operator A','Active','TENANT-REV-TEST'),('OPERATOR-REV-B','Operator B','Active','TENANT-REV-TEST'),('OPERATOR-REV-C','Operator C','Active','TENANT-REV-TEST');
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,active,company_id,project_id,operator_id)
 SELECT 'EQUIPMENT-REV-A','ART-001','Equipment A',id,'Engine Hours',true,'TENANT-REV-TEST','PROJECT-REV-A','OPERATOR-REV-A'
 FROM erp.equipment_statuses WHERE lower(code)='assigned' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1;
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,active,company_id,project_id,operator_id)
 SELECT 'EQUIPMENT-REV-B','ART-002','Equipment B',id,'Engine Hours',true,'TENANT-REV-TEST','PROJECT-REV-A','OPERATOR-REV-C'
 FROM erp.equipment_statuses WHERE lower(code)='assigned' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,remarks,status,company_id)
 VALUES('99100000-0000-4000-8000-000000000010','EQUIPMENT-REV-A','OPERATOR-REV-A','PROJECT-REV-A','2026-10-20','2026-10-25','Original','Active','TENANT-REV-TEST'),
       ('99100000-0000-4000-8000-000000000011','EQUIPMENT-REV-B','OPERATOR-REV-C','PROJECT-REV-A','2026-10-20','2026-10-25','Other','Active','TENANT-REV-TEST');
CREATE FUNCTION pg_temp.revise(command_id text, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT erp.command_revise_assignment(jsonb_build_object('commandId',command_id,'idempotencyKey',command_id,
  'assignmentId','99100000-0000-4000-8000-000000000010','expectedVersion',1,
  'operatorId','OPERATOR-REV-B','projectId','PROJECT-REV-B','assignedDate','2026-10-21',
  'expectedReturn','2026-10-26','remarks','Revised')||extra)
$$;
SELECT set_config('request.jwt.claim.sub','99100000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((pg_temp.revise('rev-forbidden')->>'code')='FORBIDDEN','read-only role denied');
SELECT set_config('request.jwt.claim.sub','99100000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((pg_temp.revise('rev-other-project','{"projectId":"PROJECT-REV-OTHER"}'::jsonb)->>'code')='NOT_FOUND','cross-tenant project denied');
SELECT pg_temp.assert_true((pg_temp.revise('rev-operator-conflict','{"operatorId":"OPERATOR-REV-C"}'::jsonb)->>'code')='OPERATOR_ALREADY_ASSIGNED','active operator exclusivity');
SELECT pg_temp.assert_true((pg_temp.revise('rev-bad-dates','{"expectedReturn":"2026-10-19"}'::jsonb)->>'code')='VALIDATION_REJECTED','invalid dates denied');
SELECT pg_temp.assert_true((pg_temp.revise('rev-ok')->>'success')='true','pre-rental revision accepted');
SELECT pg_temp.assert_true((SELECT operator_id='OPERATOR-REV-B' AND project_id='PROJECT-REV-B' AND assigned_date='2026-10-21' AND expected_return='2026-10-26' AND remarks='Revised' FROM erp.assignments WHERE id='99100000-0000-4000-8000-000000000010'),'assignment persisted');
SELECT pg_temp.assert_true((SELECT operator_id='OPERATOR-REV-B' AND project_id='PROJECT-REV-B' FROM erp.equipment WHERE id='EQUIPMENT-REV-A'),'Equipment projection updated');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='99100000-0000-4000-8000-000000000010' AND action='ASSIGNMENT_REVISED'),'revision audited once');
SELECT pg_temp.assert_true((pg_temp.revise('rev-stale')->>'code')='CONFLICT','stale version rejected');
INSERT INTO erp.rentals(id,assignment_id,project_id,customer_snapshot,project_snapshot,date_out,status,company_id)
 VALUES('99100000-0000-4000-8000-000000000020','99100000-0000-4000-8000-000000000010','PROJECT-REV-B','Customer','Project B','2026-10-21','Draft','TENANT-REV-TEST');
SELECT pg_temp.assert_true((pg_temp.revise('rev-linked','{"expectedVersion":2}'::jsonb)->>'code')='DEPENDENCY_CONFLICT','linked Rental locked');
SELECT pg_temp.assert_true((SELECT operator_id='OPERATOR-REV-B' AND remarks='Revised' FROM erp.assignments WHERE id='99100000-0000-4000-8000-000000000010'),'history unchanged on denial');
ROLLBACK;
SELECT 'PRE_RENTAL_ASSIGNMENT_REVISION_PASS';
