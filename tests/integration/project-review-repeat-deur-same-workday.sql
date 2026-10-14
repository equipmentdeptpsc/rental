\set ON_ERROR_STOP on
\if :{?legacy_batch}
\else
\set legacy_batch 0
\endif
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
DO $test$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('erp.command_start_deur_shift(jsonb)'::regprocedure) INTO definition;
  IF position($needle$timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date$needle$ IN definition)=0
    OR position($needle$resolve_uat_limited_pilot_work_date(line.id,(snap->>'workDate')::date)$needle$ IN definition)>0
  THEN RAISE EXCEPTION 'Start Shift did not use the server-owned local business date'; END IF;
END $test$;

-- A terminal DEUR does not prevent a second operational shift on the same
-- Rental line and business date. Both submissions must remain reviewable.
INSERT INTO auth.users(id) VALUES ('94000000-0000-4000-8000-000000000001');
INSERT INTO erp.companies(id,code,name,environment_class)
VALUES ('TEST-REPEAT-DEUR','REPEAT-DEUR','Local repeat DEUR fixture','test');
INSERT INTO erp.operators(id,name,status,company_id)
VALUES ('OPR-REPEAT-DEUR','Operator','Active','TEST-REPEAT-DEUR');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
VALUES ('94000000-0000-4000-8000-000000000001','repeat@example.invalid','Operator','active','OPR-REPEAT-DEUR','TEST-REPEAT-DEUR');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '94000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id)
VALUES ('CUST-REPEAT-DEUR','REPEAT-DEUR','Local customer','TEST-REPEAT-DEUR');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
VALUES ('PRJ-REPEAT-DEUR','REPEAT-DEUR','Local project','CUST-REPEAT-DEUR','TEST-REPEAT-DEUR');
INSERT INTO erp.project_customer_review_recipients(company_id,project_id,recipients,updated_by)
VALUES ('TEST-REPEAT-DEUR','PRJ-REPEAT-DEUR','[{"name":"Reviewer","email":"reviewer@example.invalid"}]'::jsonb,'fixture');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
SELECT 'EQP-REPEAT-DEUR','REPEAT-001','Equipment','None',id,'PRJ-REPEAT-DEUR','OPR-REPEAT-DEUR','TEST-REPEAT-DEUR'
FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
VALUES ('ASN-REPEAT-DEUR','EQP-REPEAT-DEUR','OPR-REPEAT-DEUR','PRJ-REPEAT-DEUR',current_date-1,current_date+7,'Active','TEST-REPEAT-DEUR');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
VALUES ('RENT-REPEAT-DEUR','REPEAT-001','CUST-REPEAT-DEUR','PRJ-REPEAT-DEUR','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REPEAT-DEUR');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
VALUES ('LINE-REPEAT-DEUR','RENT-REPEAT-DEUR','EQP-REPEAT-DEUR','ASN-REPEAT-DEUR','OPR-REPEAT-DEUR','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REPEAT-DEUR');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
VALUES
('DEUR-REPEAT-OLD','REPEAT-OLD','RENT-REPEAT-DEUR','LINE-REPEAT-DEUR','ASN-REPEAT-DEUR','EQP-REPEAT-DEUR','OPR-REPEAT-DEUR','PRJ-REPEAT-DEUR','CUST-REPEAT-DEUR',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','In Progress','TEST-REPEAT-DEUR');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
VALUES ('EVT-REPEAT-OLD-START','DEUR-REPEAT-OLD','shift','start',clock_timestamp()-interval '2 hours',1,'server',false,'TEST-REPEAT-DEUR'),
('EVT-REPEAT-OLD-END','DEUR-REPEAT-OLD','shift','end',clock_timestamp()-interval '1 hour',2,'server',false,'TEST-REPEAT-DEUR');
\if :legacy_batch
UPDATE erp.deurs SET status='Submitted',submitted_at=clock_timestamp()-interval '50 minutes',
  submitted_by='94000000-0000-4000-8000-000000000001'
WHERE id='DEUR-REPEAT-OLD';
INSERT INTO erp.customer_review_batches(company_id,customer_id,project_id,rental_id,review_date,
  business_timezone,credential_hash,expires_at,summary_snapshot,group_scope)
VALUES ('TEST-REPEAT-DEUR','CUST-REPEAT-DEUR','PRJ-REPEAT-DEUR','RENT-REPEAT-DEUR',
  (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Asia/Manila',
  encode(extensions.digest('synthetic-legacy-batch','sha256'),'hex'),clock_timestamp()+interval '7 days',
  '{}'::jsonb,'RENTAL');
INSERT INTO erp.customer_review_batch_items(batch_id,company_id,customer_id,project_id,rental_id,
  rental_equipment_line_id,equipment_id,operator_id,deur_id,revision_id,item_snapshot)
SELECT id,'TEST-REPEAT-DEUR','CUST-REPEAT-DEUR','PRJ-REPEAT-DEUR','RENT-REPEAT-DEUR',
  'LINE-REPEAT-DEUR','EQP-REPEAT-DEUR','OPR-REPEAT-DEUR','DEUR-REPEAT-OLD','DEUR-REPEAT-OLD',
  '{"equipmentName":"Equipment","assetNumber":"REPEAT-001","reviewState":"SUBMITTED_AWAITING_ACKNOWLEDGEMENT"}'::jsonb
FROM erp.customer_review_batches WHERE company_id='TEST-REPEAT-DEUR' AND group_scope='RENTAL';
UPDATE erp.customer_review_batches SET finalized_at=clock_timestamp()
WHERE company_id='TEST-REPEAT-DEUR' AND group_scope='RENTAL';
\else
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='94000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.command_submit_deur(jsonb_build_object('rentalId','RENT-REPEAT-DEUR','rentalLineId','LINE-REPEAT-DEUR',
    'equipmentId','EQP-REPEAT-DEUR','assignmentId','ASN-REPEAT-DEUR','operatorId','OPR-REPEAT-DEUR',
    'deurId','DEUR-REPEAT-OLD','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-REPEAT-OLD'),
    'deviceId','LOCAL-REPEAT','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'First Submit failed: %',result; END IF;
END $test$;
RESET ROLE;
\endif
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='94000000-0000-4000-8000-000000000001';
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id)
VALUES ('DEUR-REPEAT-NEW','REPEAT-NEW','RENT-REPEAT-DEUR','LINE-REPEAT-DEUR','ASN-REPEAT-DEUR','EQP-REPEAT-DEUR','OPR-REPEAT-DEUR','PRJ-REPEAT-DEUR','CUST-REPEAT-DEUR',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','In Progress','TEST-REPEAT-DEUR');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
VALUES ('EVT-REPEAT-NEW-START','DEUR-REPEAT-NEW','shift','start',clock_timestamp()-interval '30 minutes',1,'server',false,'TEST-REPEAT-DEUR'),
('EVT-REPEAT-NEW-END','DEUR-REPEAT-NEW','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-REPEAT-DEUR');
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; command jsonb; BEGIN
  command=jsonb_build_object('rentalId','RENT-REPEAT-DEUR','rentalLineId','LINE-REPEAT-DEUR',
    'equipmentId','EQP-REPEAT-DEUR','assignmentId','ASN-REPEAT-DEUR','operatorId','OPR-REPEAT-DEUR',
    'deurId','DEUR-REPEAT-NEW','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-REPEAT-NEW'),
    'deviceId','LOCAL-REPEAT','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid());
  result=erp.command_submit_deur(command);
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Second Submit failed: %',result; END IF;
  result=erp.command_submit_deur(command);
  IF result->>'success'<>'true' OR result->>'disposition'<>'REPLAYED'
  THEN RAISE EXCEPTION 'Second Submit retry was not idempotent: %',result; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batch_items i JOIN erp.customer_review_batches b ON b.id=i.batch_id
      WHERE b.company_id='TEST-REPEAT-DEUR' AND b.superseded_at IS NULL AND i.deur_id IN('DEUR-REPEAT-OLD','DEUR-REPEAT-NEW')
        AND i.customer_review_request_id IS NOT NULL)<>2
  THEN RAISE EXCEPTION 'Both same-day DEURs must be members of the current Project batch'; END IF;
  IF (SELECT count(*) FROM erp.customer_review_batches
      WHERE company_id='TEST-REPEAT-DEUR' AND group_scope='PROJECT' AND superseded_at IS NULL)<>1
    OR (SELECT count(*) FROM erp.notification_outbox n JOIN erp.customer_review_batches b
      ON b.id=n.source_aggregate_id::uuid WHERE b.company_id='TEST-REPEAT-DEUR'
        AND b.superseded_at IS NULL AND n.status='Pending')<>1
  THEN RAISE EXCEPTION 'Current Project batch or reviewer notification is not exactly once'; END IF;
END $test$;
\if :legacy_batch
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batches b
      JOIN erp.customer_review_batch_items i ON i.batch_id=b.id
      WHERE b.company_id='TEST-REPEAT-DEUR' AND b.group_scope='RENTAL'
        AND b.superseded_at IS NOT NULL AND i.deur_id='DEUR-REPEAT-OLD')<>1
  THEN RAISE EXCEPTION 'Historical Rental batch or item was rewritten or lost'; END IF;
END $test$;
\endif
ROLLBACK;
