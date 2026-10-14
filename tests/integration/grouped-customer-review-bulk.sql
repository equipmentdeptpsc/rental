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
INSERT INTO erp.project_customer_review_recipients(company_id,project_id,recipients,updated_by) VALUES
  ('TEST-REVIEW-BULK','PRJ-REVIEW-BULK','[{"name":"Project reviewer one","email":"project-one@example.invalid"},{"name":"Project reviewer two","email":"project-two@example.invalid"}]'::jsonb,'fixture');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-BULK-1','REVIEW-BULK-001','Equipment one','None',id,'PRJ-REVIEW-BULK','OPR-REVIEW-BULK-1','TEST-REVIEW-BULK' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-BULK-2','REVIEW-BULK-002','Equipment two','None',id,'PRJ-REVIEW-BULK','OPR-REVIEW-BULK-2','TEST-REVIEW-BULK' FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES
  ('ASN-REVIEW-BULK-1','EQP-REVIEW-BULK-1','OPR-REVIEW-BULK-1','PRJ-REVIEW-BULK',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK'),
  ('ASN-REVIEW-BULK-2','EQP-REVIEW-BULK-2','OPR-REVIEW-BULK-2','PRJ-REVIEW-BULK',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES ('RENT-REVIEW-BULK','REVIEW-BULK-001','CUST-REVIEW-BULK','PRJ-REVIEW-BULK','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REVIEW-BULK');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES ('RENT-REVIEW-BULK-2','REVIEW-BULK-002','CUST-REVIEW-BULK','PRJ-REVIEW-BULK','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REVIEW-BULK');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id) VALUES
  ('LINE-REVIEW-BULK-1','RENT-REVIEW-BULK','EQP-REVIEW-BULK-1','ASN-REVIEW-BULK-1','OPR-REVIEW-BULK-1','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK'),
  ('LINE-REVIEW-BULK-2','RENT-REVIEW-BULK-2','EQP-REVIEW-BULK-2','ASN-REVIEW-BULK-2','OPR-REVIEW-BULK-2','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,company_id) VALUES
  ('DEUR-REVIEW-BULK-1','REVIEW-BULK-001','RENT-REVIEW-BULK','LINE-REVIEW-BULK-1','ASN-REVIEW-BULK-1','EQP-REVIEW-BULK-1','OPR-REVIEW-BULK-1','PRJ-REVIEW-BULK','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-REVIEW-BULK'),
  ('DEUR-REVIEW-BULK-2','REVIEW-BULK-002','RENT-REVIEW-BULK-2','LINE-REVIEW-BULK-2','ASN-REVIEW-BULK-2','EQP-REVIEW-BULK-2','OPR-REVIEW-BULK-2','PRJ-REVIEW-BULK','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-1,'Night','In Progress','TEST-REVIEW-BULK');
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
  result=erp.command_submit_deur(jsonb_build_object('rentalId','RENT-REVIEW-BULK-2','rentalLineId','LINE-REVIEW-BULK-2',
    'equipmentId','EQP-REVIEW-BULK-2','assignmentId','ASN-REVIEW-BULK-2','operatorId','OPR-REVIEW-BULK-2',
    'deurId','DEUR-REVIEW-BULK-2','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-REVIEW-BULK-2'),
    'deviceId','LOCAL-BULK','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Second Submit failed: %',result; END IF;
END $test$;
RESET ROLE;
-- Workspace monitoring is only available with the canonical read triad.
SET LOCAL request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN
    PERFORM erp.read_project_customer_review_for_rental('RENT-REVIEW-BULK');
    RAISE EXCEPTION 'Operator unexpectedly read privileged Project review monitoring';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
INSERT INTO erp.user_roles(user_id,role_id) SELECT '93000000-0000-4000-8000-000000000001',id
  FROM erp.app_roles WHERE code='system-administrator';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE projection jsonb; BEGIN
  projection=erp.read_project_customer_review_for_rental('RENT-REVIEW-BULK');
  IF projection->>'projectId'<>'PRJ-REVIEW-BULK' OR jsonb_array_length(projection->'batches')<2
    OR jsonb_array_length(projection->'configuredReviewers')<>2
  THEN RAISE EXCEPTION 'Workspace history or reviewers missing: %',projection; END IF;
  BEGIN
    PERFORM erp.read_project_customer_review_for_rental('OTHER-TENANT-RENTAL');
    RAISE EXCEPTION 'Cross-tenant Rental lookup unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '02000' THEN NULL;
  END;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.notification_outbox n JOIN erp.customer_review_batches b ON b.id=n.source_aggregate_id::uuid
      WHERE n.company_id='TEST-REVIEW-BULK' AND b.superseded_at IS NULL AND n.status='Pending')<>2
    OR EXISTS (SELECT 1 FROM erp.notification_outbox n WHERE n.company_id='TEST-REVIEW-BULK' AND n.status='Pending' AND n.recipient_destination='legacy@example.invalid')
  THEN RAISE EXCEPTION 'Project notifications must reach exactly the two designated recipients'; END IF;
  IF (SELECT jsonb_array_length(recipient_snapshot) FROM erp.customer_review_batches
      WHERE company_id='TEST-REVIEW-BULK' AND superseded_at IS NULL)<>2
  THEN RAISE EXCEPTION 'Finalized recipient snapshot missing'; END IF;
END $test$;

-- The submit outbox does not expose a raw credential. The service-only
-- preparation rotates the current batch hash to this synthetic fixture token.
DO $test$ DECLARE intent_ids jsonb; batch_id uuid; BEGIN
  SELECT jsonb_agg(n.id ORDER BY n.id),(n.source_aggregate_id)::uuid INTO intent_ids,batch_id FROM erp.notification_outbox n
  JOIN erp.customer_review_batches b ON b.id=n.source_aggregate_id::uuid
  WHERE n.company_id='TEST-REVIEW-BULK' AND n.status='Pending' AND b.superseded_at IS NULL
  GROUP BY n.source_aggregate_id;
  IF jsonb_array_length(intent_ids)<>2 THEN RAISE EXCEPTION 'Two current notifications required'; END IF;
  PERFORM pg_catalog.set_config('test.bulk_intent_ids',intent_ids::text,true);
  PERFORM pg_catalog.set_config('test.bulk_batch_id',batch_id::text,true);
END $test$;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE result jsonb; envelopes jsonb; BEGIN
  result=erp.read_pending_project_review_batch_handoffs(10);
  IF result->>'success'<>'true' OR jsonb_array_length(result->'value')<>1
  THEN RAISE EXCEPTION 'Project batch handoff discovery failed: %',result; END IF;
  SELECT jsonb_agg(jsonb_build_object('notificationId',id,'envelopeType','GROUPED_CUSTOMER_REVIEW_PATH',
    'envelopeVersion',1,'keyVersion',1,'ciphertext',repeat('A',32),'nonce',repeat('A',16),'authTag',repeat('A',22)||'=='))
  INTO envelopes FROM jsonb_array_elements_text(current_setting('test.bulk_intent_ids')::jsonb) id;
  result=erp.prepare_project_review_batch_handoff(jsonb_build_object('batchId',current_setting('test.bulk_batch_id'),
    'credentialHash',pg_catalog.encode(extensions.digest(repeat('a',64),'sha256'),'hex'),'envelopes',envelopes));
  IF result->>'success'<>'true' OR result->>'preparedCount'<>'2'
  THEN RAISE EXCEPTION 'Shared credential preparation failed: %',result; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(DISTINCT credential_hash) FROM erp.notification_delivery_envelopes envelope
      WHERE notification_id IN (SELECT n.id FROM erp.notification_outbox n WHERE n.company_id='TEST-REVIEW-BULK' AND n.status='Pending'))<>1
  THEN RAISE EXCEPTION 'Project reviewers received different credential hashes'; END IF;
END $test$;

SET LOCAL request.jwt.claim.role='anon';
SET LOCAL ROLE anon;
DO $test$
DECLARE ids jsonb; response jsonb; command jsonb; first_id text; second_id text;
BEGIN
  SELECT jsonb_agg((item->>'publicItemId')::uuid ORDER BY (item->>'publicItemId')::uuid) INTO ids
  FROM jsonb_array_elements((erp.get_customer_review_batch(jsonb_build_object('credential',repeat('a',64)))#>'{value,items}')) item;
  IF jsonb_array_length(ids)<>2 THEN RAISE EXCEPTION 'Fixture expected two cross-Rental grouped items: %',ids; END IF;
  first_id=ids->>0; second_id=ids->>1;
  response=erp.get_customer_review_batch(jsonb_build_object('credential',repeat('a',64)));
  IF jsonb_array_length(response#>'{value,reviewers}')<>2
  THEN RAISE EXCEPTION 'Frozen Project reviewer choices missing: %',response; END IF;
  response=erp.acknowledge_customer_review_batch_item(jsonb_build_object('credential',repeat('a',64),'publicItemId',first_id,
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF response->>'code'<>'VALIDATION_REJECTED' THEN RAISE EXCEPTION 'Anonymous Project action was accepted: %',response; END IF;
  response=erp.acknowledge_customer_review_batch_items(jsonb_build_object('credential',repeat('a',64),'publicItemIds',jsonb_build_array(first_id,first_id),
    'reviewerEmail','project-one@example.invalid','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF response->>'code'<>'VALIDATION_REJECTED' THEN RAISE EXCEPTION 'Duplicate item accepted: %',response; END IF;
  BEGIN
    response=erp.acknowledge_customer_review_batch_item(jsonb_build_object('credential',repeat('a',64),'publicItemId',second_id,
      'reviewerEmail','project-two@example.invalid','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
    IF response->>'success'<>'true' THEN RAISE EXCEPTION 'Individual setup failed: %',response; END IF;
    response=erp.acknowledge_customer_review_batch_items(jsonb_build_object('credential',repeat('a',64),'publicItemIds',ids,
      'reviewerEmail','project-one@example.invalid','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
    IF response->>'code'<>'ALREADY_COMPLETED' THEN RAISE EXCEPTION 'Bulk did not reject completed item: %',response; END IF;
    response=erp.get_customer_review_batch(jsonb_build_object('credential',repeat('a',64)));
    IF response#>>'{value,actionableCount}'<>'1' OR response#>>'{value,acknowledgedCount}'<>'1'
    THEN RAISE EXCEPTION 'Failed bulk left a partial acknowledgement: %',response; END IF;
    RAISE EXCEPTION 'ROLLBACK_ATOMIC_FAILURE_PROBE' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  command=jsonb_build_object('credential',repeat('a',64),'publicItemIds',ids,
    'reviewerEmail','project-one@example.invalid','commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid());
  response=erp.acknowledge_customer_review_batch_items(command);
  IF response->>'success'<>'true' OR response#>>'{value,acknowledgedCount}'<>'2' THEN RAISE EXCEPTION 'Atomic bulk acknowledgement failed: %',response; END IF;
  response=erp.acknowledge_customer_review_batch_items(command);
  IF response->>'success'<>'true' OR response->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'Bulk replay failed: %',response; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.deurs WHERE company_id='TEST-REVIEW-BULK' AND status='Acknowledged')<>2
    OR (SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='TEST-REVIEW-BULK' AND action='ACKNOWLEDGE')<>2
    OR (SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='TEST-REVIEW-BULK' AND recipient_name='Project reviewer one')<>2
  THEN RAISE EXCEPTION 'Bulk did not preserve per-line acknowledgement evidence'; END IF;
END $test$;

-- A second Project of the same Customer must not enter the first Project's
-- batch. Exercise the new service-only atomic manual/scheduler handoff.
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
  VALUES('PRJ-REVIEW-OTHER','REVIEW-OTHER','Separate project','CUST-REVIEW-BULK','TEST-REVIEW-BULK');
INSERT INTO auth.users(id) VALUES('93000000-0000-4000-8000-000000000003');
INSERT INTO erp.companies(id,code,name,environment_class)
  VALUES('TEST-REVIEW-FOREIGN','REVIEW-FOREIGN','Foreign local fixture','test');
INSERT INTO erp.users(id,username,display_name,status,company_id)
  VALUES('93000000-0000-4000-8000-000000000003','foreign-reviewer@example.invalid','Foreign actor','active','TEST-REVIEW-FOREIGN');
INSERT INTO erp.project_customer_review_recipients(company_id,project_id,recipients,updated_by)
  VALUES('TEST-REVIEW-BULK','PRJ-REVIEW-OTHER','[{"name":"Other reviewer","email":"other-project@example.invalid"}]'::jsonb,'fixture');
INSERT INTO erp.operators(id,name,status,company_id)
  VALUES('OPR-REVIEW-OTHER','Other operator','Active','TEST-REVIEW-BULK'),
        ('OPR-REVIEW-OTHER-2','Other operator two','Active','TEST-REVIEW-BULK');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-OTHER','REVIEW-OTHER-001','Other equipment','None',id,'PRJ-REVIEW-OTHER','OPR-REVIEW-OTHER','TEST-REVIEW-BULK'
 FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-OTHER-2','REVIEW-OTHER-002','Other equipment two','None',id,'PRJ-REVIEW-OTHER','OPR-REVIEW-OTHER-2','TEST-REVIEW-BULK'
 FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
 VALUES('ASN-REVIEW-OTHER','EQP-REVIEW-OTHER','OPR-REVIEW-OTHER','PRJ-REVIEW-OTHER',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK'),
       ('ASN-REVIEW-OTHER-2','EQP-REVIEW-OTHER-2','OPR-REVIEW-OTHER-2','PRJ-REVIEW-OTHER',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES('RENT-REVIEW-OTHER','REVIEW-OTHER-001','CUST-REVIEW-BULK','PRJ-REVIEW-OTHER','Local customer','Separate project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REVIEW-BULK');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
 VALUES('LINE-REVIEW-OTHER','RENT-REVIEW-OTHER','EQP-REVIEW-OTHER','ASN-REVIEW-OTHER','OPR-REVIEW-OTHER','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK'),
       ('LINE-REVIEW-OTHER-2','RENT-REVIEW-OTHER','EQP-REVIEW-OTHER-2','ASN-REVIEW-OTHER-2','OPR-REVIEW-OTHER-2','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"Asia/Manila"}}}','TEST-REVIEW-BULK');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,submitted_at,company_id)
 VALUES('DEUR-REVIEW-OTHER','REVIEW-OTHER-001','RENT-REVIEW-OTHER','LINE-REVIEW-OTHER','ASN-REVIEW-OTHER','EQP-REVIEW-OTHER','OPR-REVIEW-OTHER','PRJ-REVIEW-OTHER','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','Submitted',clock_timestamp(),'TEST-REVIEW-BULK'),
       ('DEUR-REVIEW-OTHER-2','REVIEW-OTHER-002','RENT-REVIEW-OTHER','LINE-REVIEW-OTHER-2','ASN-REVIEW-OTHER-2','EQP-REVIEW-OTHER-2','OPR-REVIEW-OTHER-2','PRJ-REVIEW-OTHER','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','Submitted',clock_timestamp(),'TEST-REVIEW-BULK');
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE recipients jsonb; result jsonb; credential_hash text;
BEGIN
  recipients=erp.read_project_review_delivery_recipients('RENT-REVIEW-OTHER',
    '93000000-0000-4000-8000-000000000001'::uuid,false);
  IF recipients->>'success'<>'true' OR recipients#>>'{value,recipients,0,email}'<>'other-project@example.invalid'
  THEN RAISE EXCEPTION 'Project delivery recipient resolution failed: %',recipients; END IF;
  result=erp.read_project_review_delivery_recipients('RENT-REVIEW-OTHER',
    '93000000-0000-4000-8000-000000000002'::uuid,false);
  IF result->>'code'<>'FORBIDDEN' THEN RAISE EXCEPTION 'Unauthorized issuer resolved Project recipients: %',result; END IF;
  result=erp.read_project_review_delivery_recipients('RENT-REVIEW-OTHER',
    '93000000-0000-4000-8000-000000000003'::uuid,false);
  IF result->>'code'<>'FORBIDDEN' THEN RAISE EXCEPTION 'Cross-tenant actor resolved Project recipients: %',result; END IF;
  credential_hash=pg_catalog.encode(extensions.digest(repeat('b',64),'sha256'),'hex');
  result=erp.trusted_prepare_project_grouped_review_delivery(jsonb_build_object(
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),
    'rentalId','RENT-REVIEW-OTHER','businessDate',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
    'actorId','93000000-0000-4000-8000-000000000001','scheduler',false,
    'credentialHash',credential_hash,'envelopes',jsonb_build_array(jsonb_build_object(
      'recipientEmail','other-project@example.invalid','notificationId',extensions.gen_random_uuid(),
      'envelopeType','GROUPED_CUSTOMER_REVIEW_PATH','envelopeVersion',1,'keyVersion',1,
      'ciphertext',repeat('A',32),'nonce',repeat('A',16),'authTag',repeat('A',22)||'=='))));
  IF result->>'success'<>'true' OR result->>'disposition'<>'CREATED'
    OR result#>>'{value,actionableCount}'<>'2'
  THEN RAISE EXCEPTION 'Project-only trusted delivery failed: %',result; END IF;
  result=erp.trusted_prepare_grouped_customer_review_delivery('{}'::jsonb);
  IF result->>'code'<>'PROJECT_REVIEW_DELIVERY_REQUIRED'
  THEN RAISE EXCEPTION 'Legacy Rental recipient path was not disabled'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.notification_outbox WHERE company_id='TEST-REVIEW-BULK'
      AND recipient_destination='other-project@example.invalid')<>1
    OR EXISTS(SELECT 1 FROM erp.customer_review_batch_items item
      JOIN erp.customer_review_batches batch ON batch.id=item.batch_id
      WHERE batch.project_id='PRJ-REVIEW-OTHER' AND item.rental_id<>'RENT-REVIEW-OTHER')
  THEN RAISE EXCEPTION 'Cross-Project review isolation failed'; END IF;
END $test$;
SET LOCAL request.jwt.claim.role='anon';
SET LOCAL ROLE anon;
DO $test$ DECLARE result jsonb; item_id text; BEGIN
  result=erp.get_customer_review_batch(jsonb_build_object('credential',repeat('b',64)));
  IF result->>'success'<>'true' OR result#>>'{value,actionableCount}'<>'2'
  THEN RAISE EXCEPTION 'Second Project public projection unavailable: %',result; END IF;
  item_id=result#>>'{value,items,0,publicItemId}';
  result=erp.request_customer_review_batch_item_correction(jsonb_build_object(
    'credential',repeat('b',64),'publicItemId',item_id,'reviewerEmail','other-project@example.invalid',
    'remarks','The submitted operating duration requires correction.',
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'true' OR result#>>'{value,correctionRequestedCount}'<>'1'
    OR result#>>'{value,actionableCount}'<>'1'
  THEN RAISE EXCEPTION 'Individual correction did not preserve partial Project review: %',result; END IF;
  result=erp.get_customer_review_batch(jsonb_build_object('credential',repeat('d',64)));
  IF result->>'code'<>'INVALID_OR_UNAVAILABLE'
  THEN RAISE EXCEPTION 'Unrelated bearer credential exposed a batch'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_outcomes outcome
    WHERE outcome.company_id='TEST-REVIEW-BULK' AND outcome.action='REQUEST_CORRECTION'
      AND outcome.recipient_name='Other reviewer')<>1
  THEN RAISE EXCEPTION 'Claimed reviewer was not recorded on correction evidence'; END IF;
END $test$;
UPDATE erp.project_customer_review_recipients
SET recipients='[{"name":"Replacement reviewer","email":"replacement@example.invalid"}]'::jsonb,
    row_version=row_version+1
WHERE company_id='TEST-REVIEW-BULK' AND project_id='PRJ-REVIEW-OTHER';
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.trusted_prepare_project_grouped_review_delivery(jsonb_build_object(
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),
    'rentalId','RENT-REVIEW-OTHER','businessDate',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
    'actorId','93000000-0000-4000-8000-000000000001','scheduler',false,
    'credentialHash',pg_catalog.encode(extensions.digest(repeat('e',64),'sha256'),'hex'),
    'envelopes',jsonb_build_array(jsonb_build_object('recipientEmail','replacement@example.invalid',
      'notificationId',extensions.gen_random_uuid(),'envelopeType','GROUPED_CUSTOMER_REVIEW_PATH',
      'envelopeVersion',1,'keyVersion',1,'ciphertext',repeat('A',32),
      'nonce',repeat('A',16),'authTag',repeat('A',22)||'=='))));
  IF result->>'success'<>'true' OR result->>'disposition'<>'CREATED'
  THEN RAISE EXCEPTION 'Reviewer-group successor was not generated: %',result; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batches WHERE company_id='TEST-REVIEW-BULK'
      AND project_id='PRJ-REVIEW-OTHER' AND superseded_at IS NOT NULL)<>1
    OR (SELECT recipient_snapshot->0->>'email' FROM erp.customer_review_batches
      WHERE company_id='TEST-REVIEW-BULK' AND project_id='PRJ-REVIEW-OTHER' AND superseded_at IS NULL)<>'replacement@example.invalid'
  THEN RAISE EXCEPTION 'Reviewer change did not preserve immutable successor history'; END IF;
END $test$;

INSERT INTO erp.operators(id,name,status,company_id)
  VALUES('OPR-REVIEW-UTC','UTC operator','Active','TEST-REVIEW-BULK');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
 SELECT 'EQP-REVIEW-UTC','REVIEW-UTC-001','UTC equipment','None',id,'PRJ-REVIEW-OTHER','OPR-REVIEW-UTC','TEST-REVIEW-BULK'
 FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
 VALUES('ASN-REVIEW-UTC','EQP-REVIEW-UTC','OPR-REVIEW-UTC','PRJ-REVIEW-OTHER',current_date-1,current_date+7,'Active','TEST-REVIEW-BULK');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,customer_review_name_snapshot,customer_review_email_snapshot,customer_review_contact_captured_at,company_id)
 VALUES('RENT-REVIEW-UTC','REVIEW-UTC-001','CUST-REVIEW-BULK','PRJ-REVIEW-OTHER','Local customer','Separate project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','UTC','Legacy recipient','legacy@example.invalid',clock_timestamp(),'TEST-REVIEW-BULK');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
 VALUES('LINE-REVIEW-UTC','RENT-REVIEW-UTC','EQP-REVIEW-UTC','ASN-REVIEW-UTC','OPR-REVIEW-UTC','Released','{"deurExpectationSnapshot":{"meterRequirement":"none","policy":{"timezone":"UTC"}}}','TEST-REVIEW-BULK');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,submitted_at,company_id)
 VALUES('DEUR-REVIEW-UTC','REVIEW-UTC-001','RENT-REVIEW-UTC','LINE-REVIEW-UTC','ASN-REVIEW-UTC','EQP-REVIEW-UTC','OPR-REVIEW-UTC','PRJ-REVIEW-OTHER','CUST-REVIEW-BULK',(clock_timestamp() AT TIME ZONE 'UTC')::date,'Day','Submitted',clock_timestamp(),'TEST-REVIEW-BULK');
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.trusted_prepare_project_grouped_review_delivery(jsonb_build_object(
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),
    'rentalId','RENT-REVIEW-UTC','businessDate',(clock_timestamp() AT TIME ZONE 'UTC')::date,
    'actorId','93000000-0000-4000-8000-000000000001','scheduler',false,
    'credentialHash',pg_catalog.encode(extensions.digest(repeat('c',64),'sha256'),'hex'),
    'envelopes',jsonb_build_array(jsonb_build_object('recipientEmail','replacement@example.invalid',
      'notificationId',extensions.gen_random_uuid(),'envelopeType','GROUPED_CUSTOMER_REVIEW_PATH',
      'envelopeVersion',1,'keyVersion',1,'ciphertext',repeat('A',32),
      'nonce',repeat('A',16),'authTag',repeat('A',22)||'=='))));
  IF result->>'success'<>'true' OR result#>>'{value,actionableCount}'<>'1'
  THEN RAISE EXCEPTION 'Timezone-scoped Project review generation failed: %',result; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.customer_review_batches WHERE company_id='TEST-REVIEW-BULK'
      AND project_id='PRJ-REVIEW-OTHER' AND superseded_at IS NULL)<>2
  THEN RAISE EXCEPTION 'Different effective timezones were combined'; END IF;
END $test$;
DELETE FROM erp.project_customer_review_recipients WHERE company_id='TEST-REVIEW-BULK' AND project_id='PRJ-REVIEW-OTHER';
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE service_role;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.read_project_review_delivery_recipients('RENT-REVIEW-OTHER',
    '93000000-0000-4000-8000-000000000001'::uuid,false);
  IF result->>'code'<>'PROJECT_REVIEW_RECIPIENTS_REQUIRED'
  THEN RAISE EXCEPTION 'Missing Project reviewers silently fell back: %',result; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
