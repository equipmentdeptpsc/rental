BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void
LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION '%',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
('TENANT-ACTIVATE-CERT-A','ACT-A','Activate Certification A',true,'test'),
('TENANT-ACTIVATE-CERT-B','ACT-B','Activate Certification B',true,'test');
INSERT INTO auth.users(id,email) VALUES
('25000000-0000-4000-8000-000000000501','activate.admin@example.test'),
('25000000-0000-4000-8000-000000000502','activate.manager@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
('25000000-0000-4000-8000-000000000501','activate.admin','Activate Admin','activate.admin@example.test','active','TENANT-ACTIVATE-CERT-A'),
('25000000-0000-4000-8000-000000000502','activate.manager','Activate Manager','activate.manager@example.test','active','TENANT-ACTIVATE-CERT-A');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '25000000-0000-4000-8000-000000000501',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '25000000-0000-4000-8000-000000000502',id FROM erp.app_roles WHERE code='operations-manager';

INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('ACT-CUSTOMER-A','ACT-CUST-A','Activate Customer A','TENANT-ACTIVATE-CERT-A'),
('ACT-CUSTOMER-B','ACT-CUST-B','Activate Customer B','TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('ACT-PROJECT-A','ACT-PROJ-A','Activate Project A','ACT-CUSTOMER-A','TENANT-ACTIVATE-CERT-A'),
('ACT-PROJECT-B','ACT-PROJ-B','Activate Project B','ACT-CUSTOMER-B','TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
('ACT-OPERATOR-A','Activate Operator A','Active','TENANT-ACTIVATE-CERT-A'),
('ACT-OPERATOR-B','Activate Operator B','Active','TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) VALUES
('ACT-EQUIPMENT-A','ACT-EQ-A','Activate Equipment A','None',(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),'TENANT-ACTIVATE-CERT-A'),
('ACT-EQUIPMENT-B','ACT-EQ-B','Activate Equipment B','None',(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),'TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,status,company_id) VALUES
('ACT-ASSIGNMENT-A','ACT-EQUIPMENT-A','ACT-OPERATOR-A','ACT-PROJECT-A',current_date,'Active','TENANT-ACTIVATE-CERT-A'),
('ACT-ASSIGNMENT-B','ACT-EQUIPMENT-B','ACT-OPERATOR-B','ACT-PROJECT-B',current_date,'Active','TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,commercial_snapshot_required,deur_expectation_policy_required,deur_expectation_frequency,deur_expectation_effective_from,deur_expectation_captured_at,deur_expectation_frozen_at,approval_status,approval_requested_at,approval_requested_by,approval_decided_at,approval_decided_by,row_version,company_id) VALUES
('ACT-RENTAL-A','ACT-R-A','ACT-CUSTOMER-A','ACT-PROJECT-A','Activate Customer A','Activate Project A',current_date,'Operated Rental','Released',true,true,'PER_WORKDAY',current_date,clock_timestamp(),clock_timestamp(),'Approved',clock_timestamp(),'25000000-0000-4000-8000-000000000501',clock_timestamp(),'25000000-0000-4000-8000-000000000502',7,'TENANT-ACTIVATE-CERT-A'),
('ACT-RENTAL-B','ACT-R-B','ACT-CUSTOMER-B','ACT-PROJECT-B','Activate Customer B','Activate Project B',current_date,'Operated Rental','Released',true,true,'PER_WORKDAY',current_date,clock_timestamp(),clock_timestamp(),'Approved',clock_timestamp(),'25000000-0000-4000-8000-000000000501',clock_timestamp(),'25000000-0000-4000-8000-000000000502',7,'TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,commercial_snapshot_required,operational_metadata,company_id) VALUES
('ACT-LINE-A','ACT-RENTAL-A','ACT-EQUIPMENT-A','ACT-ASSIGNMENT-A','ACT-OPERATOR-A','Released',true,'{"deurExpectationSnapshot":{"policy":{"frequency":"PER_WORKDAY"},"sourceFingerprint":"CERTIFIED"}}','TENANT-ACTIVATE-CERT-A'),
('ACT-LINE-B','ACT-RENTAL-B','ACT-EQUIPMENT-B','ACT-ASSIGNMENT-B','ACT-OPERATOR-B','Released',true,'{"deurExpectationSnapshot":{"policy":{"frequency":"PER_WORKDAY"},"sourceFingerprint":"CERTIFIED"}}','TENANT-ACTIVATE-CERT-B');
INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,snapshot_hash) VALUES
('ACT-SNAPSHOT-A','ACT-RENTAL-A','ACT-LINE-A','Per Hour',1000,true,'PHP',clock_timestamp(),'ACT-SNAPSHOT-HASH-A'),
('ACT-SNAPSHOT-B','ACT-RENTAL-B','ACT-LINE-B','Per Hour',1000,true,'PHP',clock_timestamp(),'ACT-SNAPSHOT-HASH-B');

SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='rental.activate'),'System Administrator must have rental.activate');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code IN('operations-manager','dispatcher','equipment-coordinator','operator','billing-staff','finance') AND p.code='rental.activate'),'Only the Catalog-authorized role may activate');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000502',true);
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-DENIED","idempotencyKey":"ACT-DENIED","rentalId":"ACT-RENTAL-A","expectedVersion":7}'::jsonb)->>'code'='FORBIDDEN','Operations Manager must be denied');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='ACT-DENIED'),'Denied authorization must leave no command residue');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000501',true);
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-CROSS","idempotencyKey":"ACT-CROSS","rentalId":"ACT-RENTAL-B","expectedVersion":7}'::jsonb)->>'code'='NOT_FOUND','Cross-tenant Activate must be rejected');
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-STALE","idempotencyKey":"ACT-STALE","rentalId":"ACT-RENTAL-A","expectedVersion":6}'::jsonb)->>'code'='CONFLICT','Stale Activate must be rejected');
RESET ROLE;
UPDATE erp.assignments SET status='Completed' WHERE id='ACT-ASSIGNMENT-A';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000501',true);
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-INACTIVE-ASG","idempotencyKey":"ACT-INACTIVE-ASG","rentalId":"ACT-RENTAL-A","expectedVersion":7}'::jsonb)->>'code'='MISSING_RELATIONSHIP','Inactive Assignment must reject Activate');
RESET ROLE;
UPDATE erp.assignments SET status='Active' WHERE id='ACT-ASSIGNMENT-A';
UPDATE erp.operators SET status='Suspended' WHERE id='ACT-OPERATOR-A';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000501',true);
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-INACTIVE-OP","idempotencyKey":"ACT-INACTIVE-OP","rentalId":"ACT-RENTAL-A","expectedVersion":7}'::jsonb)->>'code'='MISSING_RELATIONSHIP','Inactive Operator must reject Activate');
RESET ROLE;
UPDATE erp.operators SET status='Active' WHERE id='ACT-OPERATOR-A';
SELECT pg_temp.assert_true((SELECT status='Released' AND row_version=7 FROM erp.rentals WHERE id='ACT-RENTAL-A') AND (SELECT status='Released' FROM erp.rental_equipment_lines WHERE id='ACT-LINE-A'),'Rejected Activate must not partially mutate Rental or lines');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE correlation_id IN('ACT-STALE','ACT-INACTIVE-ASG','ACT-INACTIVE-OP')),'Rejected Activate must create no audit');
CREATE TEMP TABLE pre_activate_versions AS SELECT (SELECT row_version FROM erp.assignments WHERE id='ACT-ASSIGNMENT-A') assignment_version,(SELECT row_version FROM erp.operators WHERE id='ACT-OPERATOR-A') operator_version;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000501',true);
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-ACCEPT","idempotencyKey":"ACT-IDEM","rentalId":"ACT-RENTAL-A","expectedVersion":7}'::jsonb)->'value'->>'status'='Active','Released Rental must activate');
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-REPLAY","idempotencyKey":"ACT-IDEM","rentalId":"ACT-RENTAL-A","expectedVersion":7}'::jsonb)->>'disposition'='REPLAYED','Identical Activate must replay');
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-MISMATCH","idempotencyKey":"ACT-IDEM","rentalId":"ACT-RENTAL-A","expectedVersion":8}'::jsonb)->>'code'='IDEMPOTENCY_MISMATCH','Changed payload must reject idempotency reuse');
SELECT pg_temp.assert_true(erp.command_activate_rental('{"commandId":"ACT-WRONG-SOURCE","idempotencyKey":"ACT-WRONG-SOURCE","rentalId":"ACT-RENTAL-A","expectedVersion":8}'::jsonb)->>'code'='INVALID_TRANSITION','Active Rental must reject a second distinct Activate');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT status='Active' AND row_version=8 AND activated_at IS NOT NULL FROM erp.rentals WHERE id='ACT-RENTAL-A'),'Rental must activate exactly once');
SELECT pg_temp.assert_true((SELECT status='Active' FROM erp.rental_equipment_lines WHERE id='ACT-LINE-A'),'Rental line must activate');
SELECT pg_temp.assert_true((SELECT status='Active' AND row_version=(SELECT assignment_version FROM pre_activate_versions) FROM erp.assignments WHERE id='ACT-ASSIGNMENT-A'),'Assignment must remain unchanged by Activate');
SELECT pg_temp.assert_true((SELECT status='Active' AND row_version=(SELECT operator_version FROM pre_activate_versions) FROM erp.operators WHERE id='ACT-OPERATOR-A'),'Operator must remain unchanged by Activate');
SELECT pg_temp.assert_true((SELECT lower(s.code)='rented' AND e.row_version=1 FROM erp.equipment e JOIN erp.equipment_statuses s ON s.id=e.status_id WHERE e.id='ACT-EQUIPMENT-A'),'Equipment must remain unchanged and Rented');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(snapshot_hash)='ACT-SNAPSHOT-HASH-A' FROM erp.commercial_snapshots WHERE rental_id='ACT-RENTAL-A'),'Commercial snapshot must remain unchanged');
SELECT pg_temp.assert_true((SELECT deur_expectation_frequency='PER_WORKDAY' AND deur_expectation_frozen_at IS NOT NULL FROM erp.rentals WHERE id='ACT-RENTAL-A'),'DEUR expectation must remain frozen and unchanged');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.deurs WHERE rental_id='ACT-RENTAL-A'),'Activate must create no DEUR');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='ACT-RENTAL-A' AND action='ACTIVATE_RENTAL'),'Activate audit must be exactly once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.operational_command_idempotency WHERE target_aggregate_id='ACT-RENTAL-A' AND command_type='ACTIVATE_RENTAL' AND command_status='COMPLETED'),'Activate command must be exactly once');

ROLLBACK;
