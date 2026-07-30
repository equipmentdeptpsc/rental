BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'C4 DEUR assertion failed: %',label; END IF; RETURN 1; END $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES('00000000-0000-0000-0000-000000000000','76000000-0000-0000-0000-000000000001','authenticated','authenticated','c4-operator@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES('TENANT-UAT-C4-A-DEUR','TENANT-UAT-C4-A-DEUR','C4 DEUR A','test');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('UAT-C4-DEUR-OP','Operator','Active','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
VALUES('76000000-0000-0000-0000-000000000001','c4-operator','C4 Operator','active','UAT-C4-DEUR-OP','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-UAT-C4-DEUR','c4-deur','C4 DEUR');
INSERT INTO erp.app_permissions(id,code,name) VALUES
('PERM-UAT-C4-DEUR-CREATE','deur.create','DEUR Create'),('PERM-UAT-C4-DEUR-REVIEW','deur.review','DEUR Review');
INSERT INTO erp.role_permissions VALUES
('ROLE-UAT-C4-DEUR','PERM-UAT-C4-DEUR-CREATE'),('ROLE-UAT-C4-DEUR','PERM-UAT-C4-DEUR-REVIEW');
INSERT INTO erp.user_roles(user_id,role_id) VALUES('76000000-0000-0000-0000-000000000001','ROLE-UAT-C4-DEUR');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('UAT-C4-DEUR-CUSTOMER','UAT-C4-DEUR-CUST','Customer','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('UAT-C4-DEUR-PROJECT','UAT-C4-DEUR-PROJ','Project','UAT-C4-DEUR-CUSTOMER','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES('UAT-C4-DEUR-EQ','UAT-C4-DEUR-EQ','Equipment','None','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
VALUES('UAT-C4-DEUR-ASG','UAT-C4-DEUR-EQ','UAT-C4-DEUR-OP','UAT-C4-DEUR-PROJECT','2026-07-29','2026-08-29','Active','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
VALUES('UAT-C4-DEUR-RENTAL','UAT-C4-DEUR-R','UAT-C4-DEUR-CUSTOMER','UAT-C4-DEUR-PROJECT','Customer','Project','2026-07-29','Operated Rental','Active','TENANT-UAT-C4-A-DEUR');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
VALUES('UAT-C4-DEUR-LINE','UAT-C4-DEUR-RENTAL','UAT-C4-DEUR-EQ','UAT-C4-DEUR-ASG','UAT-C4-DEUR-OP','Active','TENANT-UAT-C4-A-DEUR');

SELECT set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((erp.command_start_deur_shift('{"commandId":"UAT-C4-DEUR-START","idempotencyKey":"UAT-C4-DEUR-IDEM-START","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deviceId":"UAT-C4-DEVICE","draft":{"id":"UAT-C4-DEUR-1","workDate":"2026-07-29","shift":"Day","evidenceMode":"TIME_TIMELINE","operationalMetadata":{}}}'::jsonb)->>'success')::boolean,'start');
SELECT pg_temp.assert_true(erp.command_start_deur_shift('{"commandId":"UAT-C4-DEUR-START-RETRY","idempotencyKey":"UAT-C4-DEUR-IDEM-START","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deviceId":"UAT-C4-DEVICE","draft":{"id":"UAT-C4-DEUR-1","workDate":"2026-07-29","shift":"Day","evidenceMode":"TIME_TIMELINE","operationalMetadata":{}}}'::jsonb)->>'disposition'='REPLAYED','start replay');
SELECT pg_temp.assert_true((erp.command_transition_deur_activity('{"commandId":"UAT-C4-DEUR-IDLE","idempotencyKey":"UAT-C4-DEUR-IDEM-IDLE","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deurId":"UAT-C4-DEUR-1","action":"START_IDLE","expectedVersion":1}'::jsonb)->>'success')::boolean,'idle');
SELECT pg_temp.assert_true((erp.command_transition_deur_activity('{"commandId":"UAT-C4-DEUR-RESUME","idempotencyKey":"UAT-C4-DEUR-IDEM-RESUME","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deurId":"UAT-C4-DEUR-1","action":"RESUME_OPERATION","expectedVersion":2}'::jsonb)->>'success')::boolean,'resume');
SELECT pg_temp.assert_true((erp.command_complete_deur_shift('{"commandId":"UAT-C4-DEUR-COMPLETE","idempotencyKey":"UAT-C4-DEUR-IDEM-COMPLETE","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deurId":"UAT-C4-DEUR-1","meterRequirement":"none","expectedVersion":3}'::jsonb)->>'success')::boolean,'complete');
SELECT pg_temp.assert_true(erp.command_submit_deur('{"commandId":"UAT-C4-DEUR-SUBMIT-STALE","idempotencyKey":"UAT-C4-DEUR-IDEM-SUBMIT-STALE","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deurId":"UAT-C4-DEUR-1","expectedVersion":3}'::jsonb)->>'code'='CONFLICT','stale submit');
SELECT pg_temp.assert_true((erp.command_submit_deur('{"commandId":"UAT-C4-DEUR-SUBMIT","idempotencyKey":"UAT-C4-DEUR-IDEM-SUBMIT","rentalId":"UAT-C4-DEUR-RENTAL","rentalLineId":"UAT-C4-DEUR-LINE","assignmentId":"UAT-C4-DEUR-ASG","equipmentId":"UAT-C4-DEUR-EQ","operatorId":"UAT-C4-DEUR-OP","deurId":"UAT-C4-DEUR-1","expectedVersion":4}'::jsonb)->>'success')::boolean,'submit');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.deur_events WHERE deur_id='UAT-C4-DEUR-1')=8,'event count');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.deur_events WHERE deur_id='UAT-C4-DEUR-1' AND is_open)=0,'closed events');
SELECT pg_temp.assert_true((SELECT status FROM erp.deurs WHERE id='UAT-C4-DEUR-1')='Submitted','submitted status');

ROLLBACK;
SELECT 1/(CASE WHEN
  (SELECT count(*) FROM auth.users WHERE email='c4-operator@invalid.local')=0 AND
  (SELECT count(*) FROM erp.companies WHERE id='TENANT-UAT-C4-A-DEUR')=0 AND
  (SELECT count(*) FROM erp.deurs WHERE id='UAT-C4-DEUR-1')=0
THEN 1 ELSE 0 END);
