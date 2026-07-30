BEGIN;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES
('00000000-0000-0000-0000-000000000000','75000000-0000-0000-0000-000000000001','authenticated','authenticated','c4-review@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES
('TENANT-UAT-C4-A-REVIEW','TENANT-UAT-C4-A-REVIEW','C4 Review A','test'),
('TENANT-UAT-C4-B-REVIEW','TENANT-UAT-C4-B-REVIEW','C4 Review B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id)
VALUES('75000000-0000-0000-0000-000000000001','c4-review','C4 Review','active','TENANT-UAT-C4-A-REVIEW');
INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-UAT-C4-REVIEW','c4-review','C4 Review');
INSERT INTO erp.app_permissions(id,code,name) VALUES('PERM-UAT-C4-REVIEW','deur.review','DEUR Review');
INSERT INTO erp.role_permissions VALUES('ROLE-UAT-C4-REVIEW','PERM-UAT-C4-REVIEW');
INSERT INTO erp.user_roles(user_id,role_id) VALUES('75000000-0000-0000-0000-000000000001','ROLE-UAT-C4-REVIEW');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('UAT-C4-CUSTOMER-A','UAT-C4-CUST-A','Customer A','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-CUSTOMER-B','UAT-C4-CUST-B','Customer B','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('UAT-C4-PROJECT-A','UAT-C4-PROJ-A','Project A','UAT-C4-CUSTOMER-A','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-PROJECT-B','UAT-C4-PROJ-B','Project B','UAT-C4-CUSTOMER-B','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
('UAT-C4-OP-A','Operator A','Active','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-OP-B','Operator B','Active','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
('UAT-C4-EQ-A','UAT-C4-EQ-A','Equipment A','None','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-EQ-B','UAT-C4-EQ-B','Equipment B','None','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id) VALUES
('UAT-C4-RENTAL-A','UAT-C4-R-A','UAT-C4-CUSTOMER-A','UAT-C4-PROJECT-A','Customer A','Project A','2026-07-29','Operated Rental','Active','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-RENTAL-B','UAT-C4-R-B','UAT-C4-CUSTOMER-B','UAT-C4-PROJECT-B','Customer B','Project B','2026-07-29','Operated Rental','Active','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,operator_id,status,company_id) VALUES
('UAT-C4-LINE-A','UAT-C4-RENTAL-A','UAT-C4-EQ-A','UAT-C4-OP-A','Active','TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-LINE-B','UAT-C4-RENTAL-B','UAT-C4-EQ-B','UAT-C4-OP-B','Active','TENANT-UAT-C4-B-REVIEW');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,
  work_date,status,evidence_mode,total_operating_minutes,company_id) VALUES
('UAT-C4-DEUR-A','UAT-C4-DEUR-A','UAT-C4-RENTAL-A','UAT-C4-LINE-A','UAT-C4-EQ-A','UAT-C4-OP-A','UAT-C4-PROJECT-A','UAT-C4-CUSTOMER-A',
  '2026-07-29','Submitted','TIME_TIMELINE',60,'TENANT-UAT-C4-A-REVIEW'),
('UAT-C4-DEUR-B','UAT-C4-DEUR-B','UAT-C4-RENTAL-B','UAT-C4-LINE-B','UAT-C4-EQ-B','UAT-C4-OP-B','UAT-C4-PROJECT-B','UAT-C4-CUSTOMER-B',
  '2026-07-29','Submitted','TIME_TIMELINE',60,'TENANT-UAT-C4-B-REVIEW');

SELECT set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE created jsonb; token text; public_view jsonb; decided jsonb; replayed jsonb; invalid jsonb; cross_result jsonb;
BEGIN
  created=erp.command_create_customer_review_request('{"commandId":"UAT-C4-REVIEW-CREATE","idempotencyKey":"UAT-C4-IDEM-REVIEW","deurId":"UAT-C4-DEUR-A","rentalLineId":"UAT-C4-LINE-A","revisionId":"UAT-C4-DEUR-A"}'::jsonb);
  IF NOT coalesce((created->>'success')::boolean,false) THEN RAISE EXCEPTION 'C4 review creation failed'; END IF;
  token=created->'value'->>'rawToken';
  IF token IS NULL OR length(token)<32 THEN RAISE EXCEPTION 'C4 review token missing'; END IF;
  public_view=erp.get_public_customer_review(jsonb_build_object('token',token));
  IF NOT coalesce((public_view->>'success')::boolean,false) OR public_view->'value' ? 'companyId' OR public_view->'value' ? 'customerId' THEN
    RAISE EXCEPTION 'C4 public projection invalid';
  END IF;
  invalid=erp.get_public_customer_review('{"token":"altered-invalid-token"}'::jsonb);
  IF invalid->>'code'<>'INVALID_TOKEN' THEN RAISE EXCEPTION 'C4 altered token accepted'; END IF;
  decided=erp.public_acknowledge_customer_review(jsonb_build_object('commandId','UAT-C4-ACK','idempotencyKey','UAT-C4-IDEM-ACK','token',token,'customerName','C4 Customer'));
  IF decided->'value'->>'status'<>'Acknowledged' THEN RAISE EXCEPTION 'C4 acknowledgement failed'; END IF;
  replayed=erp.public_acknowledge_customer_review(jsonb_build_object('commandId','UAT-C4-ACK-RETRY','idempotencyKey','UAT-C4-IDEM-ACK','token',token,'customerName','C4 Customer'));
  IF replayed->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'C4 public replay failed'; END IF;
  IF erp.get_public_customer_review(jsonb_build_object('token',token))->>'code'<>'INVALID_TOKEN' THEN RAISE EXCEPTION 'C4 consumed token reusable'; END IF;
  cross_result=erp.command_create_customer_review_request('{"commandId":"UAT-C4-REVIEW-CROSS","idempotencyKey":"UAT-C4-IDEM-CROSS","deurId":"UAT-C4-DEUR-B","rentalLineId":"UAT-C4-LINE-B","revisionId":"UAT-C4-DEUR-B"}'::jsonb);
  IF cross_result->>'success'='true' OR cross_result::text LIKE '%TENANT-UAT-C4-B-REVIEW%' THEN RAISE EXCEPTION 'C4 cross-tenant review leak'; END IF;
  IF EXISTS(SELECT 1 FROM erp.customer_review_requests WHERE token_hash=token) THEN RAISE EXCEPTION 'C4 raw token persisted'; END IF;
  IF EXISTS(SELECT 1 FROM erp.audit_log WHERE coalesce(new_values::text,'') LIKE '%'||token||'%' OR coalesce(metadata::text,'') LIKE '%'||token||'%') THEN RAISE EXCEPTION 'C4 token leaked to audit'; END IF;
END $$;

SELECT 1/(CASE WHEN (SELECT status FROM erp.deurs WHERE id='UAT-C4-DEUR-A')='Acknowledged' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN (SELECT count(*) FROM erp.customer_review_requests WHERE company_id='TENANT-UAT-C4-A-REVIEW')=1 THEN 1 ELSE 0 END);

ROLLBACK;

SELECT 1/(CASE WHEN
  (SELECT count(*) FROM auth.users WHERE email LIKE 'c4-%@invalid.local')=0 AND
  (SELECT count(*) FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4-%')=0 AND
  (SELECT count(*) FROM erp.customer_review_requests WHERE company_id LIKE 'TENANT-UAT-C4-%')=0
THEN 1 ELSE 0 END);
