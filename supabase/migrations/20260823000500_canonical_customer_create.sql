BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-CUSTOMER-CREATE','customer.create','Create Customers')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='customer.create'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DELETE FROM erp.role_permissions rp
USING erp.app_permissions p,erp.app_roles r
WHERE rp.permission_id=p.id AND rp.role_id=r.id
 AND p.code='customer.create' AND r.code<>'system-administrator';

CREATE FUNCTION erp.command_create_customer(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 customer_id_value text=nullif(btrim(command->>'customerId'),''); code_value text=nullif(btrim(command->>'customerCode'),'');
 name_value text=nullif(btrim(command->>'name'),''); email_value text=nullif(btrim(command->>'email'),'');
 phone_value text=nullif(btrim(command->>'phone'),''); address_value text=nullif(btrim(command->>'address'),'');
 created_customer erp.customers; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('customer.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','customerId','customerCode','name','email','phone','address'))
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR customer_id_value IS NULL OR command->>'customerId'<>btrim(command->>'customerId')
 OR customer_id_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR code_value IS NULL OR name_value IS NULL
 OR (command ? 'email' AND jsonb_typeof(command->'email') NOT IN('string','null'))
 OR (command ? 'phone' AND jsonb_typeof(command->'phone') NOT IN('string','null'))
 OR (command ? 'address' AND jsonb_typeof(command->'address') NOT IN('string','null'))
 OR (email_value IS NOT NULL AND email_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;

 idem=erp.begin_operational_command(command,'CREATE_CUSTOMER','CUSTOMER',customer_id_value,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 INSERT INTO erp.customers(id,customer_code,name,email,phone,address,active,deleted_at,created_by,updated_by,company_id,row_version)
 VALUES(customer_id_value,code_value,name_value,email_value,phone_value,address_value,true,NULL,actor,actor,tenant,1)
 RETURNING * INTO created_customer;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'Customer',created_customer.id,'CUSTOMER_CREATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object(
  'customerId',created_customer.id,'customerCode',created_customer.customer_code,'name',created_customer.name,'email',created_customer.email,
  'phone',created_customer.phone,'address',created_customer.address,'active',created_customer.active,'rowVersion',created_customer.row_version)));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_customer.id),'value',jsonb_build_object(
  'id',created_customer.id,'companyId',created_customer.company_id,'customerCode',created_customer.customer_code,'name',created_customer.name,
  'email',created_customer.email,'phone',created_customer.phone,'address',created_customer.address,'active',created_customer.active,
  'deletedAt',created_customer.deleted_at,'createdAt',created_customer.created_at,'updatedAt',created_customer.updated_at,'rowVersion',created_customer.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_CUSTOMER','CUSTOMER',created_customer.id,tenant,actor,payload_hash,response,created_customer.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_customers_code_active' THEN RETURN jsonb_build_object('success',false,'code','CUSTOMER_CODE_CONFLICT');
 ELSIF violated_constraint='customers_pkey' THEN RETURN jsonb_build_object('success',false,'code','CUSTOMER_ID_CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_customer(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_customer(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_customer(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.customers FROM PUBLIC,anon,authenticated;

COMMIT;
