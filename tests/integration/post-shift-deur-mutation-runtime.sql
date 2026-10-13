\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE FUNCTION pg_temp.assert_code(result jsonb, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF result->>'code' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, received %',expected,result; END IF;
END $$;

INSERT INTO auth.users(id) VALUES ('830c0000-0000-4000-8000-000000000001');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES ('TEST-POSTSHIFT','TEST-POSTSHIFT','Local post-shift fixture','test');
INSERT INTO erp.operators(id,name,status,company_id) VALUES ('OPR-POSTSHIFT','Local post-shift operator','Active','TEST-POSTSHIFT');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES ('830c0000-0000-4000-8000-000000000001','postshift@example.invalid','Local post-shift operator','active','OPR-POSTSHIFT','TEST-POSTSHIFT');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '830c0000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES ('CUST-POSTSHIFT','POSTSHIFT','Local customer','TEST-POSTSHIFT');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES ('PRJ-POSTSHIFT','POSTSHIFT','Local project','CUST-POSTSHIFT','TEST-POSTSHIFT');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-POSTSHIFT','POSTSHIFT-001','Local equipment','None',id,'PRJ-POSTSHIFT','OPR-POSTSHIFT','TEST-POSTSHIFT' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
 VALUES ('ASN-POSTSHIFT','EQP-POSTSHIFT','OPR-POSTSHIFT','PRJ-POSTSHIFT',current_date,current_date+7,'Active','TEST-POSTSHIFT');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES ('RENT-POSTSHIFT','POSTSHIFT-001','CUST-POSTSHIFT','PRJ-POSTSHIFT','Local customer','Local project',current_date,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date,'{"approvalStatus":"Approved"}','Asia/Manila','Local recipient','postshift-recipient@example.invalid',clock_timestamp(),'TEST-POSTSHIFT');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
 VALUES ('LINE-POSTSHIFT','RENT-POSTSHIFT','EQP-POSTSHIFT','ASN-POSTSHIFT','OPR-POSTSHIFT','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-POSTSHIFT');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
 VALUES ('DEUR-POSTSHIFT','POSTSHIFT-001','RENT-POSTSHIFT','LINE-POSTSHIFT','ASN-POSTSHIFT','EQP-POSTSHIFT','OPR-POSTSHIFT','PRJ-POSTSHIFT','CUST-POSTSHIFT',current_date,'Day','In Progress','TEST-POSTSHIFT');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
 VALUES ('EVT-POSTSHIFT-START','DEUR-POSTSHIFT','shift','start',clock_timestamp()-interval '1 hour',1,'server',false,'TEST-POSTSHIFT'),
        ('EVT-POSTSHIFT-END','DEUR-POSTSHIFT','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-POSTSHIFT');

SET LOCAL request.jwt.claim.sub='830c0000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE base jsonb:=jsonb_build_object('rentalId','RENT-POSTSHIFT','rentalLineId','LINE-POSTSHIFT','equipmentId','EQP-POSTSHIFT','assignmentId','ASN-POSTSHIFT','operatorId','OPR-POSTSHIFT','deurId','DEUR-POSTSHIFT','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-POSTSHIFT'),'deviceId','LOCAL-POSTSHIFT'); result jsonb;
BEGIN
 result=erp.command_transition_deur_activity(base||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),'action','START_IDLE'));
 PERFORM pg_temp.assert_code(result,'INVALID_TRANSITION');
 result=erp.command_complete_deur_shift(base||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
 PERFORM pg_temp.assert_code(result,'INVALID_TRANSITION');
 result=erp.command_record_deur_travel_checkpoint(base||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),'odometer',1));
 PERFORM pg_temp.assert_code(result,'INVALID_TRANSITION');
 result=erp.command_record_deur_refuel(base||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),'odometer',1,'liters',1));
 PERFORM pg_temp.assert_code(result,'INVALID_TRANSITION');
 IF (SELECT count(*) FROM erp.deur_events WHERE deur_id='DEUR-POSTSHIFT')<>2 THEN RAISE EXCEPTION 'Rejected actions changed the DEUR'; END IF;
END $test$;
RESET ROLE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM erp.notification_outbox WHERE company_id='TEST-POSTSHIFT') THEN RAISE EXCEPTION 'Rejected actions queued customer review'; END IF; END $$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE base jsonb:=jsonb_build_object('rentalId','RENT-POSTSHIFT','rentalLineId','LINE-POSTSHIFT','equipmentId','EQP-POSTSHIFT','assignmentId','ASN-POSTSHIFT','operatorId','OPR-POSTSHIFT','deurId','DEUR-POSTSHIFT','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-POSTSHIFT'),'deviceId','LOCAL-POSTSHIFT'); result jsonb;
BEGIN
 result=erp.command_submit_deur(base||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
 IF result->>'success' IS DISTINCT FROM 'true' OR result->'record'->>'status' IS DISTINCT FROM 'Submitted' THEN RAISE EXCEPTION 'Submit failed after End Shift: %',result; END IF;
END $test$;
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM erp.notification_outbox WHERE company_id='TEST-POSTSHIFT' AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED') THEN RAISE EXCEPTION 'Successful Submit did not queue customer review'; END IF; END $$;
ROLLBACK;
SELECT 'POST_SHIFT_DEUR_MUTATION_RUNTIME_PASS';
