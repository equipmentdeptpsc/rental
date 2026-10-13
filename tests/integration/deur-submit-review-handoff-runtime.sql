\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Synthetic overnight/late submission: yesterday's work is submitted today.
-- The transaction is rolled back even when the assertion succeeds.
INSERT INTO auth.users(id) VALUES ('831c0000-0000-4000-8000-000000000001');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES ('TEST-SUBMIT-HANDOFF','SUBMIT-HANDOFF','Local handoff fixture','test');
INSERT INTO erp.operators(id,name,status,company_id) VALUES ('OPR-SUBMIT-HANDOFF','Local operator','Active','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.operators(id,name,status,company_id) VALUES ('OPR-SUBMIT-HANDOFF-2','Second local operator','Active','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES ('831c0000-0000-4000-8000-000000000001','submit-handoff@example.invalid','Local operator','active','OPR-SUBMIT-HANDOFF','TEST-SUBMIT-HANDOFF');
INSERT INTO auth.users(id) VALUES ('831c0000-0000-4000-8000-000000000002');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES ('831c0000-0000-4000-8000-000000000002','submit-handoff-2@example.invalid','Second local operator','active','OPR-SUBMIT-HANDOFF-2','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '831c0000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '831c0000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES ('CUST-SUBMIT-HANDOFF','SUBMIT-HANDOFF','Local customer','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES ('PRJ-SUBMIT-HANDOFF','SUBMIT-HANDOFF','Local project','CUST-SUBMIT-HANDOFF','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-SUBMIT-HANDOFF','SUBMIT-HANDOFF-001','Local equipment','None',id,'PRJ-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF','TEST-SUBMIT-HANDOFF' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-SUBMIT-HANDOFF-2','SUBMIT-HANDOFF-002','Second local equipment','None',id,'PRJ-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF-2','TEST-SUBMIT-HANDOFF' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
 VALUES ('ASN-SUBMIT-HANDOFF','EQP-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF','PRJ-SUBMIT-HANDOFF',current_date-1,current_date+7,'Active','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
 VALUES ('ASN-SUBMIT-HANDOFF-2','EQP-SUBMIT-HANDOFF-2','OPR-SUBMIT-HANDOFF-2','PRJ-SUBMIT-HANDOFF',current_date-1,current_date+7,'Active','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES ('RENT-SUBMIT-HANDOFF','SUBMIT-HANDOFF-001','CUST-SUBMIT-HANDOFF','PRJ-SUBMIT-HANDOFF','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Local recipient','handoff-recipient@example.invalid',clock_timestamp(),'TEST-SUBMIT-HANDOFF');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
 VALUES ('LINE-SUBMIT-HANDOFF','RENT-SUBMIT-HANDOFF','EQP-SUBMIT-HANDOFF','ASN-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
 VALUES ('LINE-SUBMIT-HANDOFF-2','RENT-SUBMIT-HANDOFF','EQP-SUBMIT-HANDOFF-2','ASN-SUBMIT-HANDOFF-2','OPR-SUBMIT-HANDOFF-2','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
 VALUES ('DEUR-SUBMIT-HANDOFF','SUBMIT-HANDOFF-001','RENT-SUBMIT-HANDOFF','LINE-SUBMIT-HANDOFF','ASN-SUBMIT-HANDOFF','EQP-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF','PRJ-SUBMIT-HANDOFF','CUST-SUBMIT-HANDOFF',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
 VALUES ('DEUR-SUBMIT-HANDOFF-2','SUBMIT-HANDOFF-002','RENT-SUBMIT-HANDOFF','LINE-SUBMIT-HANDOFF-2','ASN-SUBMIT-HANDOFF-2','EQP-SUBMIT-HANDOFF-2','OPR-SUBMIT-HANDOFF-2','PRJ-SUBMIT-HANDOFF','CUST-SUBMIT-HANDOFF',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
 VALUES ('EVT-SUBMIT-HANDOFF-START','DEUR-SUBMIT-HANDOFF','shift','start',clock_timestamp()-interval '8 hours',1,'server',false,'TEST-SUBMIT-HANDOFF'),
        ('EVT-SUBMIT-HANDOFF-END','DEUR-SUBMIT-HANDOFF','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-SUBMIT-HANDOFF');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
 VALUES ('EVT-SUBMIT-HANDOFF-2-START','DEUR-SUBMIT-HANDOFF-2','shift','start',clock_timestamp()-interval '8 hours',1,'server',false,'TEST-SUBMIT-HANDOFF'),
        ('EVT-SUBMIT-HANDOFF-2-END','DEUR-SUBMIT-HANDOFF-2','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-SUBMIT-HANDOFF');

SET LOCAL request.jwt.claim.sub='831c0000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE response jsonb; submitted_command jsonb;
BEGIN
  submitted_command=jsonb_build_object(
    'rentalId','RENT-SUBMIT-HANDOFF','rentalLineId','LINE-SUBMIT-HANDOFF',
    'equipmentId','EQP-SUBMIT-HANDOFF','assignmentId','ASN-SUBMIT-HANDOFF',
    'operatorId','OPR-SUBMIT-HANDOFF','deurId','DEUR-SUBMIT-HANDOFF',
    'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-SUBMIT-HANDOFF'),
    'deviceId','LOCAL-SUBMIT-HANDOFF','commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid());
  response=erp.command_submit_deur(submitted_command);
  IF response->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Late submit failed: %',response; END IF;
  response=erp.command_submit_deur(submitted_command);
  IF response->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Idempotent replay failed: %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batch_items WHERE company_id='TEST-SUBMIT-HANDOFF' AND deur_id='DEUR-SUBMIT-HANDOFF' AND customer_review_request_id IS NOT NULL)<>1
  THEN RAISE EXCEPTION 'Submitted DEUR must appear once with review request'; END IF;
  IF (SELECT count(*) FROM erp.notification_outbox WHERE company_id='TEST-SUBMIT-HANDOFF' AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED')<>1
  THEN RAISE EXCEPTION 'Customer acknowledgement must be queued once'; END IF;
END $test$;
-- A missing batch item must abort the entire Submit command, including any
-- in-transaction review request, batch and outbox writes.
SAVEPOINT missing_review_item;
CREATE FUNCTION pg_temp.omit_second_review_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NULL; END $$;
CREATE TRIGGER omit_second_review_item BEFORE INSERT ON erp.customer_review_batch_items
FOR EACH ROW WHEN (NEW.deur_id='DEUR-SUBMIT-HANDOFF-2')
EXECUTE FUNCTION pg_temp.omit_second_review_item();
SET LOCAL request.jwt.claim.sub='831c0000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE response jsonb; error_message text; failed boolean:=false;
BEGIN
  BEGIN
    response=erp.command_submit_deur(jsonb_build_object(
      'rentalId','RENT-SUBMIT-HANDOFF','rentalLineId','LINE-SUBMIT-HANDOFF-2',
      'equipmentId','EQP-SUBMIT-HANDOFF-2','assignmentId','ASN-SUBMIT-HANDOFF-2',
      'operatorId','OPR-SUBMIT-HANDOFF-2','deurId','DEUR-SUBMIT-HANDOFF-2',
      'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-SUBMIT-HANDOFF-2'),
      'deviceId','LOCAL-SUBMIT-HANDOFF','commandId',extensions.gen_random_uuid(),
      'idempotencyKey',extensions.gen_random_uuid()));
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS error_message=MESSAGE_TEXT;
    failed:=error_message='Submitted DEUR was not included in Customer Review batch';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Expected membership failure, got %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT status FROM erp.deurs WHERE id='DEUR-SUBMIT-HANDOFF-2')<>'In Progress'
    OR (SELECT count(*) FROM erp.customer_review_batches WHERE company_id='TEST-SUBMIT-HANDOFF')<>1
    OR (SELECT count(*) FROM erp.notification_outbox WHERE company_id='TEST-SUBMIT-HANDOFF')<>1
  THEN RAISE EXCEPTION 'Failed Submit left partial state'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT missing_review_item;
SET LOCAL request.jwt.claim.sub='831c0000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE response jsonb;
BEGIN
  response=erp.command_submit_deur(jsonb_build_object(
    'rentalId','RENT-SUBMIT-HANDOFF','rentalLineId','LINE-SUBMIT-HANDOFF-2',
    'equipmentId','EQP-SUBMIT-HANDOFF-2','assignmentId','ASN-SUBMIT-HANDOFF-2',
    'operatorId','OPR-SUBMIT-HANDOFF-2','deurId','DEUR-SUBMIT-HANDOFF-2',
    'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-SUBMIT-HANDOFF-2'),
    'deviceId','LOCAL-SUBMIT-HANDOFF','commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid()));
  IF response->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Second line submit failed: %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batches WHERE company_id='TEST-SUBMIT-HANDOFF' AND superseded_at IS NULL)<>1
  THEN RAISE EXCEPTION 'One current grouped batch expected'; END IF;
  IF (SELECT count(*) FROM erp.customer_review_batch_items item JOIN erp.customer_review_batches batch ON batch.id=item.batch_id
      WHERE item.company_id='TEST-SUBMIT-HANDOFF' AND batch.superseded_at IS NULL AND item.customer_review_request_id IS NOT NULL)<>2
  THEN RAISE EXCEPTION 'Both Rental lines must be actionable in the current batch'; END IF;
  IF (SELECT count(*) FROM erp.notification_outbox WHERE company_id='TEST-SUBMIT-HANDOFF' AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND status='Superseded')<>1
    OR (SELECT count(*) FROM erp.notification_outbox WHERE company_id='TEST-SUBMIT-HANDOFF' AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND status='Pending')<>1
  THEN RAISE EXCEPTION 'Only the successor batch may retain a pending acknowledgement intent'; END IF;
END $test$;
-- A later work date for the same Rental line must not make the prior-day
-- grouped batch ambiguous. Model a return-day Submit without reopening it.
UPDATE erp.rentals SET status='Returned' WHERE id='RENT-SUBMIT-HANDOFF';
UPDATE erp.rental_equipment_lines SET status='Returned' WHERE id='LINE-SUBMIT-HANDOFF';
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
 VALUES ('DEUR-SUBMIT-HANDOFF-RETURN','SUBMIT-HANDOFF-RETURN','RENT-SUBMIT-HANDOFF','LINE-SUBMIT-HANDOFF','ASN-SUBMIT-HANDOFF','EQP-SUBMIT-HANDOFF','OPR-SUBMIT-HANDOFF','PRJ-SUBMIT-HANDOFF','CUST-SUBMIT-HANDOFF',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','In Progress','TEST-SUBMIT-HANDOFF');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
 VALUES ('EVT-SUBMIT-HANDOFF-RETURN-START','DEUR-SUBMIT-HANDOFF-RETURN','shift','start',clock_timestamp()-interval '4 hours',1,'server',false,'TEST-SUBMIT-HANDOFF'),
        ('EVT-SUBMIT-HANDOFF-RETURN-END','DEUR-SUBMIT-HANDOFF-RETURN','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-SUBMIT-HANDOFF');
SET LOCAL request.jwt.claim.sub='831c0000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE response jsonb;
BEGIN
  response=erp.command_submit_deur(jsonb_build_object(
    'rentalId','RENT-SUBMIT-HANDOFF','rentalLineId','LINE-SUBMIT-HANDOFF',
    'equipmentId','EQP-SUBMIT-HANDOFF','assignmentId','ASN-SUBMIT-HANDOFF',
    'operatorId','OPR-SUBMIT-HANDOFF','deurId','DEUR-SUBMIT-HANDOFF-RETURN',
    'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-SUBMIT-HANDOFF-RETURN'),
    'deviceId','LOCAL-SUBMIT-HANDOFF','commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid()));
  IF response->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Return-day Submit failed: %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batch_items item JOIN erp.customer_review_batches batch ON batch.id=item.batch_id
      WHERE batch.company_id='TEST-SUBMIT-HANDOFF' AND batch.superseded_at IS NULL
        AND item.deur_id='DEUR-SUBMIT-HANDOFF-RETURN' AND item.customer_review_request_id IS NOT NULL)<>1
  THEN RAISE EXCEPTION 'Return-day DEUR missing from current review batch'; END IF;
END $test$;
ROLLBACK;
SELECT 'DEUR_SUBMIT_REVIEW_HANDOFF_RUNTIME_PASS';
