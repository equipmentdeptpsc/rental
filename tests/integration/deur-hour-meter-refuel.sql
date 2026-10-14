\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
INSERT INTO auth.users(id) VALUES ('95000000-0000-4000-8000-000000000001');
INSERT INTO erp.companies(id,code,name,environment_class)
VALUES ('TEST-HOUR-FUEL','HOUR-FUEL','Local fuel fixture','test');
INSERT INTO erp.operators(id,name,status,company_id)
VALUES ('OPR-HOUR-FUEL','Operator','Active','TEST-HOUR-FUEL');
INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
VALUES ('95000000-0000-4000-8000-000000000001','fuel@example.invalid','Operator','active','OPR-HOUR-FUEL','TEST-HOUR-FUEL');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '95000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id)
VALUES ('CUST-HOUR-FUEL','HOUR-FUEL','Local customer','TEST-HOUR-FUEL');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
VALUES ('PRJ-HOUR-FUEL','HOUR-FUEL','Local project','CUST-HOUR-FUEL','TEST-HOUR-FUEL');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id)
SELECT 'EQP-HOUR-FUEL','HOUR-001','Equipment','Engine Hours',id,'PRJ-HOUR-FUEL','OPR-HOUR-FUEL','TEST-HOUR-FUEL'
FROM erp.equipment_statuses WHERE lower(code)='assigned' ORDER BY id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
VALUES ('ASN-HOUR-FUEL','EQP-HOUR-FUEL','OPR-HOUR-FUEL','PRJ-HOUR-FUEL',current_date-1,current_date+7,'Active','TEST-HOUR-FUEL');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,timezone,company_id)
VALUES ('RENT-HOUR-FUEL','HOUR-001','CUST-HOUR-FUEL','PRJ-HOUR-FUEL','Local customer','Local project',current_date-1,current_date+7,'Operated Rental','Released','PER_WORKDAY',current_date-1,'{"approvalStatus":"Approved"}','Asia/Manila','TEST-HOUR-FUEL');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,company_id)
VALUES ('LINE-HOUR-FUEL','RENT-HOUR-FUEL','EQP-HOUR-FUEL','ASN-HOUR-FUEL','OPR-HOUR-FUEL','Released','{"deurExpectationSnapshot":{"meterRequirement":"hourMeter","policy":{"timezone":"Asia/Manila"}}}','TEST-HOUR-FUEL');
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,opening_hour_meter,company_id)
VALUES ('DEUR-HOUR-FUEL','HOUR-001','RENT-HOUR-FUEL','LINE-HOUR-FUEL','ASN-HOUR-FUEL','EQP-HOUR-FUEL','OPR-HOUR-FUEL','PRJ-HOUR-FUEL','CUST-HOUR-FUEL',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'Day','In Progress',100,'TEST-HOUR-FUEL');
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
VALUES ('EVT-HOUR-FUEL-START','DEUR-HOUR-FUEL','shift','start',clock_timestamp()-interval '20 minutes',1,'server',true,'TEST-HOUR-FUEL');
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='95000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; command jsonb; BEGIN
  command=jsonb_build_object('rentalId','RENT-HOUR-FUEL','rentalLineId','LINE-HOUR-FUEL',
    'equipmentId','EQP-HOUR-FUEL','assignmentId','ASN-HOUR-FUEL','operatorId','OPR-HOUR-FUEL',
    'deurId','DEUR-HOUR-FUEL','expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-HOUR-FUEL'),
    'hourMeter',101,'liters',20,'deviceId','LOCAL-HOUR',
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid());
  result=erp.command_record_deur_refuel(command);
  IF result->>'success'<>'true' OR result#>>'{value,meterDimension}'<>'hourMeter'
  THEN RAISE EXCEPTION 'Hour-meter refuel rejected: %',result; END IF;
  result=erp.command_record_deur_refuel(command);
  IF result->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'Hour-meter retry was not idempotent: %',result; END IF;
  result=erp.command_record_deur_refuel(command||jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'hourMeter',99));
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Hour-meter rollback accepted'; END IF;
  result=erp.command_record_deur_refuel(command||jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'odometer',101));
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Odometer supplied for hour-meter-only line'; END IF;
  result=erp.read_equipment_refuel_history('EQP-HOUR-FUEL');
  IF result->>'success'<>'true' OR result#>>'{refuels,0,meterDimension}'<>'hourMeter'
    OR result#>>'{refuels,0,hourMeter}'<>'101' OR result#>>'{refuels,0,odometer}' IS NOT NULL
  THEN RAISE EXCEPTION 'Hour-meter history mismatch: %',result; END IF;
END $test$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='95000000-0000-4000-8000-000000000099';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.command_record_deur_refuel(jsonb_build_object('rentalId','RENT-HOUR-FUEL',
    'rentalLineId','LINE-HOUR-FUEL','equipmentId','EQP-HOUR-FUEL','assignmentId','ASN-HOUR-FUEL',
    'operatorId','OPR-HOUR-FUEL','deurId','DEUR-HOUR-FUEL',
    'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-HOUR-FUEL'),
    'hourMeter',101,'liters',10,'deviceId','LOCAL-HOUR',
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Unlinked user wrote refuel evidence: %',result; END IF;
END $test$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='95000000-0000-4000-8000-000000000001';
DO $test$ BEGIN
  IF (SELECT count(*) FROM erp.deur_refuels WHERE company_id='TEST-HOUR-FUEL')<>1
  THEN RAISE EXCEPTION 'Refuel idempotency or denials created extra records'; END IF;
END $test$;
INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
VALUES ('EVT-HOUR-FUEL-END','DEUR-HOUR-FUEL','shift','end',clock_timestamp(),2,'server',false,'TEST-HOUR-FUEL');
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.command_record_deur_refuel(jsonb_build_object('rentalId','RENT-HOUR-FUEL',
    'rentalLineId','LINE-HOUR-FUEL','equipmentId','EQP-HOUR-FUEL','assignmentId','ASN-HOUR-FUEL',
    'operatorId','OPR-HOUR-FUEL','deurId','DEUR-HOUR-FUEL',
    'expectedVersion',(SELECT row_version FROM erp.deurs WHERE id='DEUR-HOUR-FUEL'),
    'hourMeter',102,'liters',10,'deviceId','LOCAL-HOUR',
    'commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'code'<>'INVALID_TRANSITION' THEN RAISE EXCEPTION 'Post-shift refuel accepted: %',result; END IF;
END $test$;
ROLLBACK;
