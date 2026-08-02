BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'C7.3.2 readiness probe failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.line_metadata(line_id text,rental_id text,equipment_id text,assignment_id text,operator_id text,project_id text) RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object(
  'costCode',jsonb_build_object('code','C7-COST'),
  'activityCode',jsonb_build_object('code','C7-ACTIVITY'),
  'deurExpectationSnapshot',jsonb_build_object(
    'rentalEquipmentLineId',line_id,'rentalId',rental_id,'equipmentId',equipment_id,
    'assignmentId',assignment_id,'operatorId',operator_id,'projectId',project_id,
    'policy',jsonb_build_object('frequency','ON_DEMAND'),'shiftWindows','[]'::jsonb,
    'workDescription',jsonb_build_object('name','Certification work','requiresRemarks',false),
    'workDate','2026-08-02','meterRequirement','none','billingMethod','Per Hour'
  )
) $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES('00000000-0000-0000-0000-000000000000','7a320000-0000-0000-0000-000000000001','authenticated','authenticated','c732-readiness@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO companies(id,code,name,environment_class) VALUES('TENANT-UAT-C7-READY','TENANT-UAT-C7-READY','C7 Readiness','test');
INSERT INTO users(id,username,display_name,status,company_id) VALUES('7a320000-0000-0000-0000-000000000001','c732-readiness','C7 Readiness','active','TENANT-UAT-C7-READY');
INSERT INTO app_roles(id,code,name) VALUES('ROLE-UAT-C7-READY','c7-readiness-certifier','C7 Readiness Certifier');
INSERT INTO role_permissions(role_id,permission_id) SELECT 'ROLE-UAT-C7-READY',id FROM app_permissions WHERE code='rental.release';
INSERT INTO user_roles(user_id,role_id) VALUES('7a320000-0000-0000-0000-000000000001','ROLE-UAT-C7-READY');
INSERT INTO customers(id,customer_code,name,company_id) VALUES('CUST-UAT-C7-READY','C7-READY','Readiness Customer','TENANT-UAT-C7-READY');
INSERT INTO projects(id,project_code,name,customer_id,active,company_id) VALUES
('PRJ-UAT-C7-READY-A','C7-READY-A','Snapshot Project','CUST-UAT-C7-READY',true,'TENANT-UAT-C7-READY'),
('PRJ-UAT-C7-READY-B','C7-READY-B','Unavailable Project','CUST-UAT-C7-READY',false,'TENANT-UAT-C7-READY'),
('PRJ-UAT-C7-READY-C','C7-READY-C','Complete Project','CUST-UAT-C7-READY',true,'TENANT-UAT-C7-READY'),
('PRJ-UAT-C7-READY-D','C7-READY-D','Multi Project','CUST-UAT-C7-READY',true,'TENANT-UAT-C7-READY');
INSERT INTO operators(id,name,status,company_id) VALUES
('OP-UAT-C7-READY-A','Readiness Operator A','Active','TENANT-UAT-C7-READY'),
('OP-UAT-C7-READY-B','Readiness Operator B','Active','TENANT-UAT-C7-READY'),
('OP-UAT-C7-READY-C','Readiness Operator C','Active','TENANT-UAT-C7-READY'),
('OP-UAT-C7-READY-D1','Readiness Operator D1','Active','TENANT-UAT-C7-READY'),
('OP-UAT-C7-READY-D2','Readiness Operator D2','Active','TENANT-UAT-C7-READY');
INSERT INTO equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
('EQ-UAT-C7-READY-A','C7-READY-A','Equipment A','None','TENANT-UAT-C7-READY'),
('EQ-UAT-C7-READY-B','C7-READY-B','Equipment B','None','TENANT-UAT-C7-READY'),
('EQ-UAT-C7-READY-C','C7-READY-C','Equipment C','None','TENANT-UAT-C7-READY'),
('EQ-UAT-C7-READY-D1','C7-READY-D1','Equipment D1','None','TENANT-UAT-C7-READY'),
('EQ-UAT-C7-READY-D2','C7-READY-D2','Equipment D2','None','TENANT-UAT-C7-READY');
INSERT INTO assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES
('ASG-UAT-C7-READY-A','EQ-UAT-C7-READY-A','OP-UAT-C7-READY-A','PRJ-UAT-C7-READY-A','2026-08-02','2026-08-31','Active','TENANT-UAT-C7-READY'),
('ASG-UAT-C7-READY-B','EQ-UAT-C7-READY-B','OP-UAT-C7-READY-B','PRJ-UAT-C7-READY-B','2026-08-02','2026-08-31','Active','TENANT-UAT-C7-READY'),
('ASG-UAT-C7-READY-C','EQ-UAT-C7-READY-C','OP-UAT-C7-READY-C','PRJ-UAT-C7-READY-C','2026-08-02','2026-08-31','Active','TENANT-UAT-C7-READY'),
('ASG-UAT-C7-READY-D1','EQ-UAT-C7-READY-D1','OP-UAT-C7-READY-D1','PRJ-UAT-C7-READY-D','2026-08-02','2026-08-31','Active','TENANT-UAT-C7-READY'),
('ASG-UAT-C7-READY-D2','EQ-UAT-C7-READY-D2','OP-UAT-C7-READY-D2','PRJ-UAT-C7-READY-D','2026-08-02','2026-08-31','Active','TENANT-UAT-C7-READY');
INSERT INTO rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,company_id) VALUES
('RENT-UAT-C7-READY-A','C7-READY-A','CUST-UAT-C7-READY','PRJ-UAT-C7-READY-A','Customer','Project A','2026-08-02','Operated Rental','Reserved','ON_DEMAND','2026-08-02','TENANT-UAT-C7-READY'),
('RENT-UAT-C7-READY-B','C7-READY-B','CUST-UAT-C7-READY','PRJ-UAT-C7-READY-B','Customer','Project B','2026-08-02','Operated Rental','Reserved','ON_DEMAND','2026-08-02','TENANT-UAT-C7-READY'),
('RENT-UAT-C7-READY-C','C7-READY-C','CUST-UAT-C7-READY','PRJ-UAT-C7-READY-C','Customer','Project C','2026-08-02','Operated Rental','Reserved','ON_DEMAND','2026-08-02','TENANT-UAT-C7-READY'),
('RENT-UAT-C7-READY-D','C7-READY-D','CUST-UAT-C7-READY','PRJ-UAT-C7-READY-D','Customer','Project D','2026-08-02','Operated Rental','Reserved','ON_DEMAND','2026-08-02','TENANT-UAT-C7-READY');
INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id) VALUES
('LINE-UAT-C7-READY-A','RENT-UAT-C7-READY-A','EQ-UAT-C7-READY-A','ASG-UAT-C7-READY-A','OP-UAT-C7-READY-A','Reserved',pg_temp.line_metadata('LINE-UAT-C7-READY-A','RENT-UAT-C7-READY-A','EQ-UAT-C7-READY-A','ASG-UAT-C7-READY-A','OP-UAT-C7-READY-A','PRJ-UAT-C7-READY-A')-'deurExpectationSnapshot','TENANT-UAT-C7-READY'),
('LINE-UAT-C7-READY-B','RENT-UAT-C7-READY-B','EQ-UAT-C7-READY-B','ASG-UAT-C7-READY-B','OP-UAT-C7-READY-B','Reserved',pg_temp.line_metadata('LINE-UAT-C7-READY-B','RENT-UAT-C7-READY-B','EQ-UAT-C7-READY-B','ASG-UAT-C7-READY-B','OP-UAT-C7-READY-B','PRJ-UAT-C7-READY-B'),'TENANT-UAT-C7-READY'),
('LINE-UAT-C7-READY-C','RENT-UAT-C7-READY-C','EQ-UAT-C7-READY-C','ASG-UAT-C7-READY-C','OP-UAT-C7-READY-C','Reserved',pg_temp.line_metadata('LINE-UAT-C7-READY-C','RENT-UAT-C7-READY-C','EQ-UAT-C7-READY-C','ASG-UAT-C7-READY-C','OP-UAT-C7-READY-C','PRJ-UAT-C7-READY-C'),'TENANT-UAT-C7-READY'),
('LINE-UAT-C7-READY-D1','RENT-UAT-C7-READY-D','EQ-UAT-C7-READY-D1','ASG-UAT-C7-READY-D1','OP-UAT-C7-READY-D1','Reserved',pg_temp.line_metadata('LINE-UAT-C7-READY-D1','RENT-UAT-C7-READY-D','EQ-UAT-C7-READY-D1','ASG-UAT-C7-READY-D1','OP-UAT-C7-READY-D1','PRJ-UAT-C7-READY-D'),'TENANT-UAT-C7-READY'),
('LINE-UAT-C7-READY-D2','RENT-UAT-C7-READY-D','EQ-UAT-C7-READY-D2','ASG-UAT-C7-READY-D2','OP-UAT-C7-READY-D2','Reserved',pg_temp.line_metadata('LINE-UAT-C7-READY-D2','RENT-UAT-C7-READY-D','EQ-UAT-C7-READY-D2','ASG-UAT-C7-READY-D2','OP-UAT-C7-READY-D2','PRJ-UAT-C7-READY-D')-'deurExpectationSnapshot','TENANT-UAT-C7-READY');
INSERT INTO commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,captured_at) VALUES
('SNAP-UAT-C7-READY-A','RENT-UAT-C7-READY-A','LINE-UAT-C7-READY-A','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',now()),
('SNAP-UAT-C7-READY-B','RENT-UAT-C7-READY-B','LINE-UAT-C7-READY-B','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',now()),
('SNAP-UAT-C7-READY-C','RENT-UAT-C7-READY-C','LINE-UAT-C7-READY-C','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',now()),
('SNAP-UAT-C7-READY-D1','RENT-UAT-C7-READY-D','LINE-UAT-C7-READY-D1','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',now()),
('SNAP-UAT-C7-READY-D2','RENT-UAT-C7-READY-D','LINE-UAT-C7-READY-D2','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',now());

SELECT set_config('request.jwt.claim.sub','7a320000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((erp.rental_release_readiness('RENT-UAT-C7-READY-A')->>'eligible')::boolean=false,'missing snapshot is ineligible');
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-READY-A')::text like '%snapshot%','missing snapshot is reported');
SELECT pg_temp.assert_true((erp.rental_release_readiness('RENT-UAT-C7-READY-B')->>'eligible')::boolean=false,'inactive project is ineligible');
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-READY-B')::text like '%project%','unavailable project is reported');
SELECT pg_temp.assert_true((erp.rental_release_readiness('RENT-UAT-C7-READY-C')->>'eligible')::boolean=true,'complete line is eligible');
SELECT pg_temp.assert_true((erp.rental_release_readiness('RENT-UAT-C7-READY-D')->>'eligible')::boolean=false,'one incomplete line blocks rental');
SELECT pg_temp.assert_true(jsonb_array_length(erp.rental_release_readiness('RENT-UAT-C7-READY-D')->'incompleteEquipmentLines')=1,'only incomplete line is reported');
RESET ROLE;

ROLLBACK;
SELECT 1/(CASE WHEN
  (SELECT count(*) FROM auth.users WHERE id='7a320000-0000-0000-0000-000000000001')=0 AND
  (SELECT count(*) FROM erp.companies WHERE id='TENANT-UAT-C7-READY')=0 AND
  (SELECT count(*) FROM erp.rentals WHERE id LIKE 'RENT-UAT-C7-READY-%')=0
THEN 1 ELSE 0 END) AS zero_residue;
