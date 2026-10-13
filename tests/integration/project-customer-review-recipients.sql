\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO auth.users(id) VALUES
  ('92800000-0000-4000-8000-000000000001'),
  ('92800000-0000-4000-8000-000000000002'),
  ('92800000-0000-4000-8000-000000000003'),
  ('92800000-0000-4000-8000-000000000004');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES
  ('TEST-PROJECT-REVIEW-A','TEST-PROJECT-REVIEW-A','Local review tenant A','test'),
  ('TEST-PROJECT-REVIEW-B','TEST-PROJECT-REVIEW-B','Local review tenant B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
  ('92800000-0000-4000-8000-000000000001','review-admin-a@example.invalid','Review admin A','active','TEST-PROJECT-REVIEW-A'),
  ('92800000-0000-4000-8000-000000000002','review-viewer-a@example.invalid','Review viewer A','active','TEST-PROJECT-REVIEW-A'),
  ('92800000-0000-4000-8000-000000000003','review-admin-b@example.invalid','Review admin B','active','TEST-PROJECT-REVIEW-B'),
  ('92800000-0000-4000-8000-000000000004','review-operator-a@example.invalid','Review operator A','active','TEST-PROJECT-REVIEW-A');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '92800000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '92800000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='management-viewer';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '92800000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '92800000-0000-4000-8000-000000000004',id FROM erp.app_roles WHERE code='operator';
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
  ('CUST-PROJECT-REVIEW-A','REVIEW-A','Review customer A','TEST-PROJECT-REVIEW-A'),
  ('CUST-PROJECT-REVIEW-B','REVIEW-B','Review customer B','TEST-PROJECT-REVIEW-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
  ('PRJ-PROJECT-REVIEW-A1','REVIEW-A1','Review project A1','CUST-PROJECT-REVIEW-A','TEST-PROJECT-REVIEW-A'),
  ('PRJ-PROJECT-REVIEW-A2','REVIEW-A2','Review project A2','CUST-PROJECT-REVIEW-A','TEST-PROJECT-REVIEW-A'),
  ('PRJ-PROJECT-REVIEW-B1','REVIEW-B1','Review project B1','CUST-PROJECT-REVIEW-B','TEST-PROJECT-REVIEW-B');

SET LOCAL request.jwt.claim.sub='92800000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE result jsonb; command jsonb;
BEGIN
  result=erp.read_project_customer_review_recipients('PRJ-PROJECT-REVIEW-A1');
  IF result->>'rowVersion'<>'0' OR result->'recipients'<>'[]'::jsonb THEN RAISE EXCEPTION 'Missing configuration must be an explicit empty result'; END IF;
  command=jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid(),
    'projectId','PRJ-PROJECT-REVIEW-A1','expectedVersion',0,'recipients',jsonb_build_array(
      jsonb_build_object('name','First reviewer','email','FIRST@EXAMPLE.INVALID'),
      jsonb_build_object('name','Second reviewer','email','second@example.invalid')));
  result=erp.command_update_project_customer_review_recipients(command);
  IF result->>'success'<>'true' OR result#>>'{value,rowVersion}'<>'1' OR result#>>'{value,recipients,0,email}'<>'first@example.invalid'
  THEN RAISE EXCEPTION 'Authorized Project recipients were not saved: %',result; END IF;
  result=erp.command_update_project_customer_review_recipients(command);
  IF result->>'success'<>'true' OR result->>'disposition'<>'REPLAYED' THEN RAISE EXCEPTION 'Idempotent replay failed: %',result; END IF;
  result=erp.command_update_project_customer_review_recipients(command||jsonb_build_object('commandId',extensions.gen_random_uuid(),'idempotencyKey',extensions.gen_random_uuid()));
  IF result->>'code'<>'CONFLICT' THEN RAISE EXCEPTION 'Stale version accepted: %',result; END IF;
  result=erp.command_update_project_customer_review_recipients(jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'projectId','PRJ-PROJECT-REVIEW-A2','expectedVersion',0,
    'recipients',jsonb_build_array(jsonb_build_object('name','A2 reviewer','email','a2@example.invalid'))));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Second Project configuration failed: %',result; END IF;
  IF (erp.read_project_customer_review_recipients('PRJ-PROJECT-REVIEW-A2')#>>'{recipients,0,email}')='first@example.invalid'
  THEN RAISE EXCEPTION 'Customer sibling Projects leaked recipient configuration'; END IF;
  result=erp.command_update_project_customer_review_recipients(jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'projectId','PRJ-PROJECT-REVIEW-A1','expectedVersion',1,
    'recipients',jsonb_build_array(jsonb_build_object('name','One','email','DUP@example.invalid'),jsonb_build_object('name','Two','email','dup@example.invalid'))));
  IF result->>'code'<>'VALIDATION_REJECTED' THEN RAISE EXCEPTION 'Duplicate email accepted: %',result; END IF;
  result=erp.command_update_project_customer_review_recipients(jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'projectId','PRJ-PROJECT-REVIEW-A1','expectedVersion',1));
  IF result->>'code'<>'VALIDATION_REJECTED' THEN RAISE EXCEPTION 'Missing recipient array accepted: %',result; END IF;
END $test$;

SET LOCAL request.jwt.claim.sub='92800000-0000-4000-8000-000000000002';
DO $test$ DECLARE result jsonb; BEGIN
  result=erp.read_project_customer_review_recipients('PRJ-PROJECT-REVIEW-A1');
  IF jsonb_array_length(result->'recipients')<>2 THEN RAISE EXCEPTION 'project.read failed'; END IF;
  result=erp.command_update_project_customer_review_recipients(jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'projectId','PRJ-PROJECT-REVIEW-A1','expectedVersion',1,'recipients','[]'::jsonb));
  IF result->>'code'<>'FORBIDDEN' THEN RAISE EXCEPTION 'project.update permission not enforced: %',result; END IF;
END $test$;

SET LOCAL request.jwt.claim.sub='92800000-0000-4000-8000-000000000004';
DO $test$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM erp.read_project_customer_review_recipients('PRJ-PROJECT-REVIEW-A1');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'project.read permission not enforced'; END IF;
END $test$;

SET LOCAL request.jwt.claim.sub='92800000-0000-4000-8000-000000000003';
DO $test$ DECLARE result jsonb; denied boolean:=false; BEGIN
  BEGIN PERFORM erp.read_project_customer_review_recipients('PRJ-PROJECT-REVIEW-A1');
  EXCEPTION WHEN SQLSTATE '02000' THEN denied=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-tenant read accepted'; END IF;
  result=erp.command_update_project_customer_review_recipients(jsonb_build_object('commandId',extensions.gen_random_uuid(),
    'idempotencyKey',extensions.gen_random_uuid(),'projectId','PRJ-PROJECT-REVIEW-A1','expectedVersion',1,'recipients','[]'::jsonb));
  IF result->>'code'<>'NOT_FOUND' THEN RAISE EXCEPTION 'Cross-tenant write accepted: %',result; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
