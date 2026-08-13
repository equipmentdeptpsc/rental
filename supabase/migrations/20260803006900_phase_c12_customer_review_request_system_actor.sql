BEGIN;SET search_path=erp,pg_catalog;
ALTER TABLE erp.customer_review_requests ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE erp.customer_review_requests ADD COLUMN created_by_system_principal_id uuid REFERENCES erp.system_principals(id),
 ADD CONSTRAINT customer_review_requests_created_actor_check CHECK((created_by IS NOT NULL)::integer+(created_by_system_principal_id IS NOT NULL)::integer=1);
DO $$DECLARE definition text;BEGIN SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'created_by,issued_at,recipient_name','created_by,created_by_system_principal_id,issued_at,recipient_name');
 definition:=replace(definition,'now_at+interval ''7 days'',auth.uid(),now_at,btrim','now_at+interval ''7 days'',CASE WHEN nullif(current_setting(''erp.system_principal_id'',true),'''') IS NULL THEN auth.uid() END,nullif(current_setting(''erp.system_principal_id'',true),'''')::uuid,now_at,btrim');
 IF definition NOT LIKE '%created_by_system_principal_id%' THEN RAISE EXCEPTION '06900 request actor extension did not match grouped generator' USING ERRCODE='55000';END IF;EXECUTE definition;END $$;
COMMENT ON COLUMN erp.customer_review_requests.created_by_system_principal_id IS 'Non-human system authority for scheduler-created requests; mutually exclusive with Auth user created_by.';
COMMIT;
