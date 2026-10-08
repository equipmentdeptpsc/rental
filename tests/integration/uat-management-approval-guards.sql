BEGIN;
SET LOCAL search_path = erp, auth, extensions, pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION '%', message; END IF;
END $$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES ('TENANT-MGMT-CERT','MGCERT','Management Approval Certification',true,'test');
INSERT INTO auth.users(id,email) VALUES
  ('f0000000-0000-4000-8000-000000000001','manager@example.test'),
  ('f0000000-0000-4000-8000-000000000002','requester@example.test'),
  ('f0000000-0000-4000-8000-000000000003','auditor@example.test'),
  ('f0000000-0000-4000-8000-000000000004','billing@example.test'),
  ('f0000000-0000-4000-8000-000000000005','dispatcher@example.test'),
  ('f0000000-0000-4000-8000-000000000006','viewer@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
  ('f0000000-0000-4000-8000-000000000001','cert.manager','Cert Manager','manager@example.test','active','TENANT-MGMT-CERT'),
  ('f0000000-0000-4000-8000-000000000002','cert.requester','Cert Requester','requester@example.test','active','TENANT-MGMT-CERT'),
  ('f0000000-0000-4000-8000-000000000003','cert.auditor','Cert Auditor','auditor@example.test','active','TENANT-MGMT-CERT'),
  ('f0000000-0000-4000-8000-000000000004','cert.billing','Cert Billing','billing@example.test','active','TENANT-MGMT-CERT'),
  ('f0000000-0000-4000-8000-000000000005','cert.dispatcher','Cert Dispatcher','dispatcher@example.test','active','TENANT-MGMT-CERT'),
  ('f0000000-0000-4000-8000-000000000006','cert.viewer','Cert Viewer','viewer@example.test','active','TENANT-MGMT-CERT');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT 'f0000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operations-manager';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT 'f0000000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='read-only-auditor';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT 'f0000000-0000-4000-8000-000000000004',id FROM erp.app_roles WHERE code='billing-staff';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT 'f0000000-0000-4000-8000-000000000005',id FROM erp.app_roles WHERE code='dispatcher';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT 'f0000000-0000-4000-8000-000000000006',id FROM erp.app_roles WHERE code='management-viewer';

INSERT INTO erp.operators(id,name,status,company_id) VALUES ('CERT-OP','Certification Operator','Active','TENANT-MGMT-CERT');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
VALUES ('CERT-EQ','CERT-EQ','Certification Equipment','Preventive','TENANT-MGMT-CERT');
INSERT INTO erp.rentals(id,rental_number,customer_snapshot,project_snapshot,date_out,status,approval_status,approval_requested_at,approval_requested_by,approval_decided_at,approval_decided_by,company_id)
VALUES
  ('CERT-RENT-PARENT','CERT-RENT-PARENT','Cert Customer','Cert Project',current_date,'Draft','Pending',now(),'f0000000-0000-4000-8000-000000000002',null,null,'TENANT-MGMT-CERT'),
  ('CERT-RENT-LINE','CERT-RENT-LINE','Cert Customer','Cert Project',current_date,'Draft','Pending',now(),'f0000000-0000-4000-8000-000000000002',null,null,'TENANT-MGMT-CERT'),
  ('CERT-RENT-SELF','CERT-RENT-SELF','Cert Customer','Cert Project',current_date,'Draft','Pending',now(),'f0000000-0000-4000-8000-000000000001',null,null,'TENANT-MGMT-CERT'),
  ('CERT-RENT-BILLING','CERT-RENT-BILLING','Cert Customer','Cert Project',current_date,'Reserved','Approved',now(),'f0000000-0000-4000-8000-000000000001',now(),'f0000000-0000-4000-8000-000000000001','TENANT-MGMT-CERT');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,operator_id,status,company_id)
VALUES ('CERT-LINE','CERT-RENT-LINE','CERT-EQ','CERT-OP','Reserved','TENANT-MGMT-CERT');
INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,company_id)
VALUES ('CERT-STMT','CERT-STMT','CERT-RENT-BILLING','Cert Customer','Cert Project',current_date,current_date,100,0,0,100,'Draft','Not Invoiced','f0000000-0000-4000-8000-000000000001','TENANT-MGMT-CERT');
INSERT INTO erp.deurs(id,rental_id,equipment_id,operator_id,work_date,status,company_id)
VALUES ('CERT-DEUR','CERT-RENT-BILLING','CERT-EQ','CERT-OP',current_date,'Acknowledged','TENANT-MGMT-CERT');
INSERT INTO erp.billing_statement_lines(id,billing_statement_id,deur_id,work_date,description,amount,grand_total,company_id)
VALUES ('CERT-STMT-LINE','CERT-STMT','CERT-DEUR',current_date,'Certification line',100,100,'TENANT-MGMT-CERT');

SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.read_canonical_rental_reference_data()->>'success')::boolean,'Auditor reference-data read should be allowed');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('billing.update'),'Auditor must not gain billing mutations');

SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((erp.read_canonical_rental_reference_data()->>'success')::boolean,'Billing Officer reference-data read should be allowed');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('rental.release'),'Billing Officer must not gain rental lifecycle permissions');

SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true(erp.current_user_has_permission('rental.read'),'Dispatcher rental read fixture should remain allowed');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('billing.read') AND NOT erp.current_user_has_permission('users.manage'),'Dispatcher must not gain Billing/Admin permissions');

SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert_true((erp.read_dashboard_management_financial_summary(current_date,current_date,current_date-1,current_date-1)->>'success')::boolean,'Management Viewer aggregate read should be allowed');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('billing.update') AND NOT erp.current_user_has_permission('rental.approval.decide'),'Management Viewer remains read-only');

SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(erp.current_user_has_permission('dashboard.financial.read') AND erp.current_user_has_permission('billing.approve'),'Operations Manager scoped grants should be active');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('billing.update') AND NOT erp.current_user_has_permission('collections.read'),'Operations Manager has no broad finance permissions');
SELECT pg_temp.assert_true((erp.read_dashboard_management_financial_summary(current_date,current_date,current_date-1,current_date-1)->>'success')::boolean,'Operations Manager financial aggregate should be allowed');
SELECT pg_temp.assert_true((erp.read_pending_management_approvals()->>'success')::boolean,'Operations Manager pending approval read should be allowed');
SELECT pg_temp.assert_true((erp.read_pending_management_approvals()->>'rentalCount')::integer=2,'Pending Rental count should include actionable Draft requests and exclude self-submitted requests');
SELECT pg_temp.assert_true((erp.read_pending_management_approvals()->>'billingCount')::integer=1,'Pending Billing count should include prepared Draft statements');

DO $$ DECLARE result jsonb; error_text text; BEGIN
  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
  result=erp.command_decide_rental_approval(jsonb_build_object('rentalId','CERT-RENT-PARENT','decision','Approved','commandId','f0000000-0000-4000-8000-000000000103','idempotencyKey','cert-auditor-approval','expectedVersion',1));
  IF result->>'code'<>'FORBIDDEN' THEN RAISE EXCEPTION 'Unauthorized Rental approval was not rejected: %',result; END IF;

  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000004',true);
  result=erp.command_finalize_billing_statement(jsonb_build_object('statementId','CERT-STMT','commandId','f0000000-0000-4000-8000-000000000104','idempotencyKey','cert-billing-officer-approval','expectedVersion',1));
  IF result->>'code'<>'FORBIDDEN' THEN RAISE EXCEPTION 'Unauthorized Billing Officer approval was not rejected: %',result; END IF;

  PERFORM set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
  BEGIN
    UPDATE erp.rentals SET status='Released' WHERE id='CERT-RENT-PARENT';
    RAISE EXCEPTION 'Unapproved parent release unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS error_text=MESSAGE_TEXT;
    IF error_text<>'Operations Manager approval is required before this rental can be released.' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE erp.rental_equipment_lines SET status='Released' WHERE id='CERT-LINE';
    RAISE EXCEPTION 'Unapproved line release unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS error_text=MESSAGE_TEXT;
    IF error_text<>'Operations Manager approval is required before this rental can be released.' THEN RAISE; END IF;
  END;
  result=erp.command_decide_rental_approval(jsonb_build_object('rentalId','CERT-RENT-PARENT','decision','Approved','commandId','f0000000-0000-4000-8000-000000000101','idempotencyKey','cert-rental-approval','expectedVersion',1));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Operations Manager rental approval failed: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='CERT-RENT-PARENT' AND action='RENTAL_APPROVED' AND actor_name='Cert Manager' AND metadata->'approverRoles' ? 'operations-manager') THEN
    RAISE EXCEPTION 'Rental approval audit actor or role metadata missing';
  END IF;
  UPDATE erp.rentals SET status='Released' WHERE id='CERT-RENT-PARENT';
  IF (SELECT status FROM erp.rentals WHERE id='CERT-RENT-PARENT')<>'Released' THEN RAISE EXCEPTION 'Approved parent release did not pass'; END IF;
  result=erp.command_decide_rental_approval(jsonb_build_object('rentalId','CERT-RENT-LINE','decision','Approved','commandId','f0000000-0000-4000-8000-000000000105','idempotencyKey','cert-line-approval','expectedVersion',1));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Operations Manager line Rental approval failed: %',result; END IF;
  UPDATE erp.rental_equipment_lines SET status='Released' WHERE id='CERT-LINE';
  IF (SELECT status FROM erp.rental_equipment_lines WHERE id='CERT-LINE')<>'Released' THEN RAISE EXCEPTION 'Approved Rental line release did not pass'; END IF;

  BEGIN
    INSERT INTO erp.notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint)
    VALUES('TENANT-MGMT-CERT','BILLING_STATEMENT_EMAIL','customer@example.test','Customer','BILLING_STATEMENT','CERT-STMT',1,'cert-unapproved-send',repeat('b',64));
    RAISE EXCEPTION 'Unapproved billing customer send unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS error_text=MESSAGE_TEXT;
    IF error_text<>'Operations Manager approval is required before this billing statement can be sent to the customer.' THEN RAISE; END IF;
  END;

  result=erp.command_finalize_billing_statement(jsonb_build_object('statementId','CERT-STMT','commandId','f0000000-0000-4000-8000-000000000102','idempotencyKey','cert-billing-approval','expectedVersion',1));
  IF result->>'success'<>'true' OR result#>>'{value,approvalStatus}'<>'Approved' THEN RAISE EXCEPTION 'Operations Manager billing approval failed: %',result; END IF;
  result=erp.command_finalize_billing_statement(jsonb_build_object('statementId','CERT-STMT','commandId','f0000000-0000-4000-8000-000000000102','idempotencyKey','cert-billing-approval','expectedVersion',1));
  IF result->>'success'<>'true' OR result->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'Repeated billing approval was not idempotent: %',result; END IF;

  INSERT INTO erp.notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint)
  VALUES('TENANT-MGMT-CERT','BILLING_STATEMENT_EMAIL','customer@example.test','Customer','BILLING_STATEMENT','CERT-STMT',1,'cert-approved-send',repeat('a',64));
END $$;

ROLLBACK;
