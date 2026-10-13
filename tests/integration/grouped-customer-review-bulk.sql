\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO auth.users(id) VALUES ('93000000-0000-4000-8000-000000000001'),('93000000-0000-4000-8000-000000000002');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES ('TEST-REVIEW-BULK','REVIEW-BULK','Local bulk fixture','test');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
  ('OPR-REVIEW-BULK-1','Operator one','Active','TEST-REVIEW-BULK'),
  ('OPR-REVIEW-BULK-2','Operator two','Active','TEST-REVIEW-BULK');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
  ('93000000-0000-4000-8000-000000000001','bulk-operator-1@example.invalid','Operator one','active','OPR-REVIEW-BULK-1','TEST-REVIEW-BULK'),
  ('93000000-0000-4000-8000-000000000002','bulk-operator-2@example.invalid','Operator two','active','OPR-REVIEW-BULK-2','TEST-REVIEW-BULK');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '93000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '93000000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES ('CUST-REVIEW-BULK','REVIEW-BULK','Local customer','TEST-REVIEW-BULK');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES ('PRJ-REVIEW-BULK','REVIEW-BULK','Local project','CUST-REVIEW-BULK','TEST-REVIEW-BULK');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-BULK-1','REVIEW-BULK-001','Equipment one','None',id,'PRJ-REVIEW-BULK','OPR-REVIEW-BULK-1','TEST-REVIEW-BULK' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-BULK-2','REVIEW-BULK-002','Equipment two','None',id,'PRJ-REVIEW-BULK','OPR-REVIEW-BULK-2','TEST-REVIEW-BULK' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES
  ('ASN-REVIEW-BULK-1','EQP-REVIEW-BULK-1','OPR-REVIEW-BULK-1','PRJ-REVIEW-BULK',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK'),
  ('ASN-REVIEW-BULK-2','EQP-REVIEW-BULK-2','OPR-REVIEW-BULK-2','PRJ-REVIEW-BULK',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES ('RENT-REVIEW-BULK','REVIEW-BULK-001','CUST-REVIEW-BULK','PRJ-REVIEW-BULK','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REVIEW-BULK');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id) VALUES
  ('LINE-REVIEW-BULK-1','RENT-REVIEW-BULK','EQP-REVIEW-BULK-1','ASN-REVIEW-BULK-1','OPR-REVIEW-BULK-1','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK'),
  ('LINE-REVIEW-BULK-2','RENT-REVIEW-BULK','EQP-REVIEW-BULK-2','ASN-REVIEW-BULK-2','OPR-REVIEW-BULK-2','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id) VALUES
  ('DEUR-REVIEW-BULK-1','REVIEW-BULK-001','RENT-REVIEW-BULK','LINE-REVIEW-BULK-1','ASN-REVIEW-BULK-1','EQP-REVIEW-BULK-1','OPR-REVIEW-BULK-1','PRJ-REVIEW-BULK','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-REVIEW-BULK'),
  ('DEUR-REVIEW-BULK-2','REVIEW-BULK-002','RENT-REVIEW-BULK','LINE-REVIEW-BULK-2','ASN-REVIEW-BULK-2','EQP-REVIEW-BULK-2','OPR-REVIEW-BULK-2','PRJ-REVIEW-BULK','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-REVIEW-BULK');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id) VALUES
  ('EVT-REVIEW-BULK-1-START','DEUR-REVIEW-BULK-1','shift','start',clock_timestamp()-interval '8 hours',1,'server',false,'TEST-REVIEW-BULK'),
  ('EVT-REVIEW-BULK-1-END','DEUR-REVIEW-BULK-1','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-REVIEW-BULK'),
  ('EVT-REVIEW-BULK-2-START','DEUR-REVIEW-BULK-2','shift','start',clock_timestamp()-interval '8 hours',1,'server',false,'TEST-REVIEW-BULK'),
  ('EVT-REVIEW-BULK-2-END','DEUR-REVIEW-BULK-2','shift','end',clock_timestamp()-interval '1 minute',2,'server',false,'TEST-REVIEW-BULK');

SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.command_submit_deur(jsonb_build_object('rentalId','RENT-REVIEW-BULK','rentalLineId','LINE-REVIEW-BULK-1',
    'equipmentId','EQP-REVIEW-BULK-1','assignmentId','ASN-REVIEW-BULK-1','operatorId','OPR-REVIEW-BULK-1',
    'deurId','DEUR-REVIEW-BULK-1','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-REVIEW-BULK-1'),
    'deviceId','LOCAL-BULK','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'First Submit failed: %',result; END IF;
END $test$;
SET LOCAL request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.command_submit_deur(jsonb_build_object('rentalId','RENT-REVIEW-BULK','rentalLineId','LINE-REVIEW-BULK-2',
    'equipmentId','EQP-REVIEW-BULK-2','assignmentId','ASN-REVIEW-BULK-2','operatorId','OPR-REVIEW-BULK-2',
    'deurId','DEUR-REVIEW-BULK-2','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-REVIEW-BULK-2'),
    'deviceId','LOCAL-BULK','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Second Submit failed: %',result; END IF;
END $test$;
RESET ROLE;

-- The submit outbox does not expose a raw credential. The service-only
-- preparation rotates the current batch hash to this synthetic fixture token.
DO $test$ DECLARE intent_id uuid; batch_id uuid; BEGIN
  SELECT n.id,(n.source_aggregate_id)::uuid INTO intent_id,batch_id FROM erp.notification_outbox n
  JOIN erp.customer_review_batches b ON b.id=n.source_aggregate_id::uuid
  WHERE n.company_id='TEST-REVIEW-BULK' AND n.status='Pending' AND b.superseded_at IS NULL;
  IF intent_id IS NULL THEN RAISE EXCEPTION 'Current notification missing'; END IF;
  PERFORM pg_catalog.set_config('test.bulk_intent_id',intent_id::text,true);
  PERFORM pg_catalog.set_config('test.bulk_batch_id',batch_id::text,true);
END $test$;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.prepare_submitted_deur_review_handoff(jsonb_build_object('notificationId',current_setting('test.bulk_intent_id'),
    'batchId',current_setting('test.bulk_batch_id'),
    'credentialHash',pg_catalog.encode(extensions.digest(repeat('a',64),'sha256'),'hex'),
    'envelopeType','GROUPED_CUSTOMER_REVIEW_PATH','envelopeVersion',1,'keyVersion',1,
    'ciphertext',repeat('A',32),'nonce',repeat('A',16),'authTag',repeat('A',22)||'=='));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Credential preparation failed: %',result; END IF;
END $test$;
RESET ROLE;

SET LOCAL request.jwt.claim.role='anon';
SET LOCAL ROLE anon;
DO $test$
DECLARE ids jsonb; response jsonb; command jsonb; first_id text; second_id text;
BEGIN
  SELECT jsonb_agg((item->>'publicItemId')::uuid ORDER BY (item->>'publicItemId')::uuid) INTO ids
  FROM jsonb_array_elements((erp.get_customer_review_batch(jsonb_build_object('credential',repeat('a',64)))#>'{value,items}')) item;
  IF jsonb_array_length(ids)<>2 THEN RAISE EXCEPTION 'Fixture expected two grouped items: %',ids; END IF;
  first_id=ids->>0; second_id=ids->>1;
  response=erp.acknowledge_customer_review_batch_items(jsonb_build_object('credential',repeat('a',64),'publicItemIds',jsonb_build_array(first_id,first_id),
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF response->>'code'<>'VALIDATION_REJECTED' THEN RAISE EXCEPTION 'Duplicate item accepted: %',response; END IF;
  BEGIN
    response=erp.acknowledge_customer_review_batch_item(jsonb_build_object('credential',repeat('a',64),'publicItemId',second_id,
      'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
    IF response->>'success'<>'true' THEN RAISE EXCEPTION 'Individual setup failed: %',response; END IF;
    response=erp.acknowledge_customer_review_batch_items(jsonb_build_object('credential',repeat('a',64),'publicItemIds',ids,
      'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
    IF response->>'code'<>'ALREADY_COMPLETED' THEN RAISE EXCEPTION 'Bulk did not reject completed item: %',response; END IF;
    response=erp.get_customer_review_batch(jsonb_build_object('credential',repeat('a',64)));
    IF response#>>'{value,actionableCount}'<>'1' OR response#>>'{value,acknowledgedCount}'<>'1'
    THEN RAISE EXCEPTION 'Failed bulk left a partial acknowledgement: %',response; END IF;
    RAISE EXCEPTION 'ROLLBACK_ATOMIC_FAILURE_PROBE' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  command=jsonb_build_object('credential',repeat('a',64),'publicItemIds',ids,
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid());
  response=erp.acknowledge_customer_review_batch_items(command);
  IF response->>'success'<>'true' OR response#>>'{value,acknowledgedCount}'<>'2' THEN RAISE EXCEPTION 'Atomic bulk acknowledgement failed: %',response; END IF;
  response=erp.acknowledge_customer_review_batch_items(command);
  IF response->>'success'<>'true' OR response->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'Bulk replay failed: %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.deurs WHERE company_id='TEST-REVIEW-BULK' AND status='Acknowledged')<>2
    OR (SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='TEST-REVIEW-BULK' AND action='ACKNOWLEDGE')<>2
  THEN RAISE EXCEPTION 'Bulk did not preserve per-line acknowledgement evidence'; END IF;
END $test$;
ROLLBACK;
