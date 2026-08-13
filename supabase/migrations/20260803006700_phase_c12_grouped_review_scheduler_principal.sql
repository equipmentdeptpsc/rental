BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE TABLE erp.system_principals(
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(), company_id text NOT NULL REFERENCES erp.companies(id),
 principal_type text NOT NULL CHECK(principal_type='GROUPED_REVIEW_SCHEDULER'), display_name text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,principal_type)
);
CREATE TABLE erp.system_principal_permissions(
 principal_id uuid NOT NULL REFERENCES erp.system_principals(id) ON DELETE CASCADE,
 permission_code text NOT NULL CHECK(permission_code='grouped_review.schedule'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(principal_id,permission_code)
);
ALTER TABLE erp.system_principals ENABLE ROW LEVEL SECURITY;ALTER TABLE erp.system_principal_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.system_principals,erp.system_principal_permissions FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp.current_company_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,public,auth,pg_catalog AS $$
 SELECT coalesce((SELECT company_id FROM erp.users WHERE id=auth.uid() AND status='active'),
   (SELECT company_id FROM erp.system_principals WHERE id=nullif(current_setting('erp.system_principal_id',true),'')::uuid AND active AND auth.role()='service_role'))
$$;
CREATE OR REPLACE FUNCTION erp.current_user_has_permission(required_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=auth.uid() AND p.permission_code=required_permission)
 OR (auth.role()='service_role' AND current_setting('erp.scheduler_preparation',true)='true' AND required_permission='deur.review' AND EXISTS(
   SELECT 1 FROM erp.system_principals s JOIN erp.system_principal_permissions p ON p.principal_id=s.id
   WHERE s.id=nullif(current_setting('erp.system_principal_id',true),'')::uuid AND s.active AND p.permission_code='grouped_review.schedule'))
$$;

DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('erp.trusted_prepare_grouped_customer_review_delivery(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,
  'IF NOT EXISTS(SELECT 1 FROM erp.users WHERE id=actor_id AND status=''active'') THEN',
  'IF NOT EXISTS(SELECT 1 FROM erp.users WHERE id=actor_id AND status=''active'') AND NOT EXISTS(SELECT 1 FROM erp.system_principals WHERE id=actor_id AND active AND id=nullif(current_setting(''erp.system_principal_id'',true),'''')::uuid) THEN');
 IF definition NOT LIKE '%erp.system_principals WHERE id=actor_id%' THEN RAISE EXCEPTION '06700 atomic preparation actor extension did not match 06300' USING ERRCODE='55000';END IF;
 EXECUTE definition;
END $$;

CREATE FUNCTION erp.resolve_grouped_review_scheduler_principal(target_company_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE principal erp.system_principals;
BEGIN
 IF auth.role()<>'service_role' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 SELECT s.* INTO principal FROM erp.system_principals s JOIN erp.system_principal_permissions p ON p.principal_id=s.id
 WHERE s.company_id=target_company_id AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule';
 IF principal.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCHEDULER_PRINCIPAL_NOT_CONFIGURED');END IF;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('principalId',principal.id,'companyId',principal.company_id,'actorType','SYSTEM','principalType',principal.principal_type));
END $$;

CREATE FUNCTION erp.trusted_prepare_grouped_customer_review_delivery_as_scheduler(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE principal erp.system_principals; result jsonb; principal_id uuid;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR coalesce(command->>'principalId','') !~ '^[0-9a-f-]{36}$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 principal_id=(command->>'principalId')::uuid;
 SELECT s.* INTO principal FROM erp.system_principals s JOIN erp.system_principal_permissions p ON p.principal_id=s.id
 WHERE s.id=principal_id AND s.active AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND p.permission_code='grouped_review.schedule';
 IF principal.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCHEDULER_PRINCIPAL_NOT_CONFIGURED');END IF;
 PERFORM set_config('erp.system_principal_id',principal.id::text,true);PERFORM set_config('erp.scheduler_preparation','true',true);
 result=erp.trusted_prepare_grouped_customer_review_delivery((command-'principalId')||jsonb_build_object('actorId',principal.id));
 IF result->>'success'='true' THEN INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,actor_name,occurred_at,correlation_id,new_values)
 VALUES(extensions.gen_random_uuid()::text,principal.company_id,'SYSTEM_PRINCIPAL',principal.id::text,'GROUPED_REVIEW_SCHEDULE_PREPARED',principal.id::text,principal.display_name,clock_timestamp(),command->>'commandId',jsonb_build_object('actorType','SYSTEM','principalType',principal.principal_type,'disposition',result->>'disposition'));END IF;
 RETURN result;
END $$;

CREATE FUNCTION erp.configure_c12_grouped_review_scheduler_principal(target_tenant_id text,enabled boolean,confirmation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;principal_id uuid;
BEGIN SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF session_user<>database_owner OR current_user<>database_owner THEN RAISE EXCEPTION 'database-owner session required' USING ERRCODE='42501';END IF;
 IF target_tenant_id<>'TENANT-UAT-C12-GROUPED-CUSTOMER-001' OR confirmation<>'CONFIRM-C12-GROUPED-SCHEDULER-PRINCIPAL' THEN RAISE EXCEPTION 'invalid scheduler principal scope' USING ERRCODE='42501';END IF;
 INSERT INTO erp.system_principals(company_id,principal_type,display_name,active) VALUES(target_tenant_id,'GROUPED_REVIEW_SCHEDULER','Grouped Review Scheduler',enabled)
 ON CONFLICT(company_id,principal_type) DO UPDATE SET active=excluded.active,updated_at=clock_timestamp() RETURNING id INTO principal_id;
 INSERT INTO erp.system_principal_permissions(principal_id,permission_code) VALUES(principal_id,'grouped_review.schedule') ON CONFLICT DO NOTHING;RETURN principal_id;
END $$;

DO $$ DECLARE definition text;BEGIN SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code',
 'DELETE FROM system_principal_permissions p USING system_principals s WHERE p.principal_id=s.id AND s.company_id=target_tenant_id; DELETE FROM system_principals WHERE company_id=target_tenant_id; DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code');
 IF definition NOT LIKE '%DELETE FROM system_principal_permissions%' THEN RAISE EXCEPTION '06700 cleanup extension did not match' USING ERRCODE='55000';END IF;EXECUTE definition;END $$;

ALTER FUNCTION erp.resolve_grouped_review_scheduler_principal(text) OWNER TO postgres;ALTER FUNCTION erp.trusted_prepare_grouped_customer_review_delivery_as_scheduler(jsonb) OWNER TO postgres;ALTER FUNCTION erp.configure_c12_grouped_review_scheduler_principal(text,boolean,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_grouped_review_scheduler_principal(text),erp.trusted_prepare_grouped_customer_review_delivery_as_scheduler(jsonb),erp.configure_c12_grouped_review_scheduler_principal(text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.resolve_grouped_review_scheduler_principal(text),erp.trusted_prepare_grouped_customer_review_delivery_as_scheduler(jsonb) TO service_role;
COMMIT;
