BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS integer LANGUAGE plpgsql AS $$ BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Return gate certification failed: %',label;END IF;RETURN 1;END $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES('00000000-0000-0000-0000-000000000000','78000000-0000-0000-0000-000000000001','authenticated','authenticated','return-cert@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES('TENANT-RETURN-A','RETURN-A','Return A','test'),('TENANT-RETURN-B','RETURN-B','Return B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES('78000000-0000-0000-0000-000000000001','return-cert','Return Cert','active','TENANT-RETURN-A');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '78000000-0000-0000-0000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('RETURN-CUST-A','RETURN-CUST-A','Customer A','TENANT-RETURN-A'),('RETURN-CUST-B','RETURN-CUST-B','Customer B','TENANT-RETURN-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('RETURN-PROJ-A','RETURN-PROJ-A','Project A','RETURN-CUST-A','TENANT-RETURN-A'),('RETURN-PROJ-B','RETURN-PROJ-B','Project B','RETURN-CUST-B','TENANT-RETURN-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('RETURN-OP-A1','Operator A1','Active','TENANT-RETURN-A'),('RETURN-OP-A2','Operator A2','Active','TENANT-RETURN-A'),('RETURN-OP-B','Operator B','Active','TENANT-RETURN-B');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) VALUES
('RETURN-EQ-A1','RETURN-EQ-A1','Equipment A1','None',(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),'TENANT-RETURN-A'),
('RETURN-EQ-A2','RETURN-EQ-A2','Equipment A2','None',(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),'TENANT-RETURN-A'),
('RETURN-EQ-B','RETURN-EQ-B','Equipment B','None',(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),'TENANT-RETURN-B');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,status,company_id) VALUES('RETURN-ASG-A1','RETURN-EQ-A1','RETURN-OP-A1','RETURN-PROJ-A','2026-08-26','Active','TENANT-RETURN-A'),('RETURN-ASG-A2','RETURN-EQ-A2','RETURN-OP-A2','RETURN-PROJ-A','2026-08-26','Active','TENANT-RETURN-A'),('RETURN-ASG-B','RETURN-EQ-B','RETURN-OP-B','RETURN-PROJ-B','2026-08-26','Active','TENANT-RETURN-B');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,released_at,row_version,timezone,company_id) VALUES
('RETURN-RENTAL-A','RNT-RETURN-A','RETURN-CUST-A','RETURN-PROJ-A','Customer A','Project A','2026-08-26','Operated Rental','Active','2026-08-26T00:00:00+08',5,'Asia/Manila','TENANT-RETURN-A'),
('RETURN-RENTAL-B','RNT-RETURN-B','RETURN-CUST-B','RETURN-PROJ-B','Customer B','Project B','2026-08-26','Operated Rental','Active','2026-08-26T00:00:00+08',1,'Asia/Manila','TENANT-RETURN-B');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,row_version,operational_metadata,company_id) VALUES
('RETURN-LINE-A1','RETURN-RENTAL-A','RETURN-EQ-A1','RETURN-ASG-A1','RETURN-OP-A1','Active',1,'{"deurExpectationSnapshot":{"sourceFingerprint":"FP-A1","policy":{"frequency":"PER_WORKDAY","effectiveFrom":"2026-08-26","timezone":"Asia/Manila"}}}','TENANT-RETURN-A'),
('RETURN-LINE-A2','RETURN-RENTAL-A','RETURN-EQ-A2','RETURN-ASG-A2','RETURN-OP-A2','Active',1,'{"deurExpectationSnapshot":{"sourceFingerprint":"FP-A2","policy":{"frequency":"PER_WORKDAY","effectiveFrom":"2026-08-26","timezone":"Asia/Manila"}}}','TENANT-RETURN-A'),
('RETURN-LINE-B','RETURN-RENTAL-B','RETURN-EQ-B','RETURN-ASG-B','RETURN-OP-B','Active',1,'{"deurExpectationSnapshot":{"sourceFingerprint":"FP-B","policy":{"frequency":"PER_WORKDAY","effectiveFrom":"2026-08-26","timezone":"Asia/Manila"}}}','TENANT-RETURN-B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true(NOT (erp.get_rental_return_readiness('{"rentalId":"RETURN-RENTAL-A"}')::jsonb->'value'->>'ready')::boolean,'missing denied');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.rentals WHERE id='RETURN-RENTAL-A' AND status='Active')=1,'denial has no side effects');

INSERT INTO erp.deur_expectation_dispositions(company_id,rental_id,rental_equipment_line_id,work_date,expectation_fingerprint,disposition,reason,command_id,created_by) VALUES
('TENANT-RETURN-A','RETURN-RENTAL-A','RETURN-LINE-A1','2026-08-26','FP-A1','WAIVED','Certified no-work date','RETURN-WAIVE-A1','78000000-0000-0000-0000-000000000001');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,assignment_id,operator_id,project_id,customer_id,work_date,status,evidence_mode,company_id) VALUES
('RETURN-DEUR-A1-27','RETURN-DEUR-A1-27','RETURN-RENTAL-A','RETURN-LINE-A1','RETURN-EQ-A1','RETURN-ASG-A1','RETURN-OP-A1','RETURN-PROJ-A','RETURN-CUST-A','2026-08-27','Acknowledged','TIME_TIMELINE','TENANT-RETURN-A'),
('RETURN-DEUR-A2-26','RETURN-DEUR-A2-26','RETURN-RENTAL-A','RETURN-LINE-A2','RETURN-EQ-A2','RETURN-ASG-A2','RETURN-OP-A2','RETURN-PROJ-A','RETURN-CUST-A','2026-08-26','Acknowledged','TIME_TIMELINE','TENANT-RETURN-A'),
('RETURN-DEUR-A2-27','RETURN-DEUR-A2-27','RETURN-RENTAL-A','RETURN-LINE-A2','RETURN-EQ-A2','RETURN-ASG-A2','RETURN-OP-A2','RETURN-PROJ-A','RETURN-CUST-A','2026-08-27','Acknowledged','TIME_TIMELINE','TENANT-RETURN-A');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((erp.get_rental_return_readiness('{"rentalId":"RETURN-RENTAL-A"}')::jsonb->'value'->>'ready')::boolean,'waived and acknowledged accepted across lines/dates');
SELECT pg_temp.assert_true(erp.get_rental_return_readiness('{"rentalId":"RETURN-RENTAL-B"}')::jsonb->>'code'='NOT_FOUND','cross tenant hidden');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='Active' FROM erp.rentals WHERE id='RETURN-RENTAL-A'),'readiness certification does not execute Return');

ROLLBACK;
SELECT 1/(CASE WHEN (SELECT count(*) FROM erp.companies WHERE id LIKE 'TENANT-RETURN-%')=0 THEN 1 ELSE 0 END);
