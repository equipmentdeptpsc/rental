BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-OPERATOR-MANAGE','operator.manage','Manage Operators')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='operator.manage'
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE FUNCTION erp.command_create_operator(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 name_value text=nullif(btrim(command->>'name'),''); email_value text=nullif(btrim(command->>'email'),'');
 license_number_value text=nullif(btrim(command->>'licenseNumber'),'');
 certification_type_value text=coalesce(nullif(btrim(command->>'certificationType'),''),'None');
 joined_date_value date; created_operator erp.operators; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('operator.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id','status','deletedAt','deleted_at','rowVersion','row_version','createdBy','created_by','updatedBy','updated_by','userId','user_id','applicationUserId','authUserId','username','password','pin','pinVerifier','operatorUserLink','linkedUser','legacyPayload','legacy_payload','certificationTypes']
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR nullif(btrim(command->>'operatorId'),'') IS NULL OR command->>'operatorId'<>btrim(command->>'operatorId')
 OR command->>'operatorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR name_value IS NULL OR certification_type_value NOT IN ('Heavy Machinery','Forklift','Crane Logistics','None')
 OR (command ? 'joinedDate' AND nullif(btrim(command->>'joinedDate'),'') IS NOT NULL AND command->>'joinedDate' !~ '^\d{4}-\d{2}-\d{2}$')
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN joined_date_value=nullif(btrim(command->>'joinedDate'),'')::date;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;

 idem=erp.begin_operational_command(command,'CREATE_OPERATOR','OPERATOR',command->>'operatorId',tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 INSERT INTO erp.operators(id,name,email,license_number,certification_type,status,joined_date,deleted_at,created_by,updated_by,company_id)
 VALUES(command->>'operatorId',name_value,email_value,license_number_value,certification_type_value,'Active',joined_date_value,NULL,actor,actor,tenant)
 RETURNING * INTO created_operator;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'Operator',created_operator.id,'OPERATOR_CREATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object('name',created_operator.name,'email',created_operator.email,'licenseNumber',created_operator.license_number,'certificationType',created_operator.certification_type,'joinedDate',created_operator.joined_date,'status',created_operator.status)));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_operator.id),'value',jsonb_build_object(
  'id',created_operator.id,'companyId',created_operator.company_id,'name',created_operator.name,'email',created_operator.email,
  'licenseNumber',created_operator.license_number,'certificationType',created_operator.certification_type,'status',created_operator.status,
  'joinedDate',created_operator.joined_date,'deletedAt',created_operator.deleted_at,'createdAt',created_operator.created_at,
  'updatedAt',created_operator.updated_at,'rowVersion',created_operator.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_OPERATOR','OPERATOR',created_operator.id,tenant,actor,payload_hash,response,created_operator.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='operators_pkey' THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_ID_CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_operator(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_operator(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_operator(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.operators FROM PUBLIC,anon,authenticated;

COMMIT;
