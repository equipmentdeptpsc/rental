BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE erp.certification_types (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES erp.companies(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name=btrim(name) AND name<>''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
  UNIQUE (company_id,id)
);
CREATE UNIQUE INDEX uq_certification_types_company_name_normalized ON erp.certification_types(company_id,lower(name));

CREATE TABLE erp.operator_certifications (
  operator_id text NOT NULL,
  certification_type_id text NOT NULL,
  company_id text NOT NULL REFERENCES erp.companies(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
  PRIMARY KEY(operator_id,certification_type_id),
  FOREIGN KEY(company_id,operator_id) REFERENCES erp.operators(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,certification_type_id) REFERENCES erp.certification_types(company_id,id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION erp.validate_operator_certification_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=NEW.operator_id AND o.company_id=NEW.company_id)
     OR NOT EXISTS(SELECT 1 FROM erp.certification_types t WHERE t.id=NEW.certification_type_id AND t.company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'operator certification tenant mismatch';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER operator_certifications_tenant_guard BEFORE INSERT OR UPDATE ON erp.operator_certifications
FOR EACH ROW EXECUTE FUNCTION erp.validate_operator_certification_tenant();
CREATE TRIGGER certification_types_set_updated BEFORE UPDATE ON erp.certification_types
FOR EACH ROW EXECUTE FUNCTION erp.set_updated_at_and_version();
CREATE TRIGGER operator_certifications_set_updated BEFORE UPDATE ON erp.operator_certifications
FOR EACH ROW EXECUTE FUNCTION erp.set_updated_at_and_version();

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM erp.operators WHERE certification_type IS NOT NULL AND btrim(certification_type) NOT IN ('Heavy Machinery','Forklift','Crane Logistics','None')) THEN
    RAISE EXCEPTION 'unexpected historical operator certification value; migration stopped without changing data';
  END IF;
END $$;

INSERT INTO erp.certification_types(id,company_id,name,active)
SELECT extensions.gen_random_uuid()::text,c.id,v.name,true
FROM erp.companies c CROSS JOIN (VALUES ('Heavy Machinery'),('Forklift'),('Crane Logistics')) AS v(name)
ON CONFLICT DO NOTHING;

INSERT INTO erp.operator_certifications(operator_id,certification_type_id,company_id,created_at,updated_at,created_by,updated_by)
SELECT o.id,t.id,o.company_id,o.created_at,o.updated_at,o.created_by,o.updated_by
FROM erp.operators o
JOIN erp.certification_types t ON t.company_id=o.company_id AND lower(t.name)=lower(btrim(o.certification_type))
WHERE o.certification_type IS NOT NULL AND btrim(o.certification_type)<>'None'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION erp.require_certification_actor(required_permission text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
  ) THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT erp.current_user_has_permission(required_permission) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN tenant;
END $$;

CREATE OR REPLACE FUNCTION erp.list_certification_types(include_inactive boolean DEFAULT false)
RETURNS TABLE(id text,name text,active boolean,created_at timestamptz,updated_at timestamptz,row_version bigint,usage_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text;
BEGIN
  tenant=erp.require_certification_actor('masterData.manage');
  RETURN QUERY SELECT t.id,t.name,t.active,t.created_at,t.updated_at,t.row_version,count(oc.operator_id)
  FROM erp.certification_types t LEFT JOIN erp.operator_certifications oc ON oc.certification_type_id=t.id AND oc.company_id=t.company_id
  WHERE t.company_id=tenant AND (include_inactive OR t.active)
  GROUP BY t.id,t.name,t.active,t.created_at,t.updated_at,t.row_version ORDER BY lower(t.name);
END $$;

CREATE OR REPLACE FUNCTION erp.list_assignable_certification_types()
RETURNS TABLE(id text,name text,active boolean,row_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text;
BEGIN
  tenant=erp.require_certification_actor('operator.manage');
  RETURN QUERY SELECT t.id,t.name,t.active,t.row_version FROM erp.certification_types t
  WHERE t.company_id=tenant AND t.active ORDER BY lower(t.name);
END $$;

CREATE OR REPLACE FUNCTION erp.list_operator_certifications(target_operator_id text)
RETURNS TABLE(operator_id text,certification_type_id text,name text,active boolean,created_at timestamptz,updated_at timestamptz,row_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text;
BEGIN
  tenant=erp.require_certification_actor('operator.read');
  IF NOT EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=target_operator_id AND o.company_id=tenant) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN QUERY SELECT oc.operator_id,t.id,t.name,t.active,oc.created_at,oc.updated_at,oc.row_version
  FROM erp.operator_certifications oc JOIN erp.certification_types t ON t.id=oc.certification_type_id AND t.company_id=oc.company_id
  WHERE oc.operator_id=target_operator_id AND oc.company_id=tenant ORDER BY lower(t.name);
END $$;

CREATE OR REPLACE FUNCTION erp.command_create_certification_type(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); type_id text=nullif(btrim(command->>'certificationTypeId'),''); type_name text=nullif(btrim(command->>'name'),''); created erp.certification_types; idem jsonb; payload_hash text; response jsonb; constraint_name text;
BEGIN
  tenant=erp.require_certification_actor('masterData.manage');
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','certificationTypeId','name'))
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR type_id IS NULL OR command->>'certificationTypeId'<>btrim(command->>'certificationTypeId')
    OR type_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR type_name IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  idem=erp.begin_operational_command(command,'CREATE_CERTIFICATION_TYPE','CertificationType',type_id,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';
  INSERT INTO erp.certification_types(id,company_id,name,active,created_by,updated_by) VALUES(type_id,tenant,type_name,true,actor,actor) RETURNING * INTO created;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'CertificationType',created.id,'CERTIFICATION_TYPE_CREATED',actor,now_at,command->>'commandId',jsonb_build_object('name',created.name,'active',created.active,'rowVersion',created.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created.id),'value',jsonb_build_object('id',created.id,'name',created.name,'active',created.active,'createdAt',created.created_at,'updatedAt',created.updated_at,'rowVersion',created.row_version));
  RETURN erp.finish_operational_command(command,'CREATE_CERTIFICATION_TYPE','CertificationType',created.id,tenant,actor,payload_hash,response,created.row_version);
EXCEPTION WHEN unique_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME; IF constraint_name='uq_certification_types_company_name_normalized' THEN RETURN jsonb_build_object('success',false,'code','CERTIFICATION_TYPE_CONFLICT'); ELSIF constraint_name='certification_types_pkey' THEN RETURN jsonb_build_object('success',false,'code','CERTIFICATION_TYPE_ID_CONFLICT'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_update_certification_type(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); type_id text=nullif(btrim(command->>'certificationTypeId'),''); type_name text=nullif(btrim(command->>'name'),''); expected bigint; prior erp.certification_types; changed erp.certification_types; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_certification_actor('masterData.manage');
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','certificationTypeId','name','expectedRowVersion')) OR type_id IS NULL OR type_name IS NULL OR jsonb_typeof(command->'expectedRowVersion')<>'number' OR command->>'expectedRowVersion' !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  expected=(command->>'expectedRowVersion')::bigint; SELECT * INTO prior FROM erp.certification_types WHERE id=type_id AND company_id=tenant FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF; IF prior.row_version<>expected THEN RETURN jsonb_build_object('success',false,'code','CONFLICT'); END IF;
  idem=erp.begin_operational_command(command,'UPDATE_CERTIFICATION_TYPE','CertificationType',type_id,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  UPDATE erp.certification_types SET name=type_name,updated_by=actor WHERE id=type_id AND company_id=tenant RETURNING * INTO changed;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'CertificationType',type_id,'CERTIFICATION_TYPE_UPDATED',actor,now_at,command->>'commandId',jsonb_build_object('name',prior.name,'active',prior.active,'rowVersion',prior.row_version),jsonb_build_object('name',changed.name,'active',changed.active,'rowVersion',changed.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(type_id),'value',jsonb_build_object('id',changed.id,'name',changed.name,'active',changed.active,'rowVersion',changed.row_version)); RETURN erp.finish_operational_command(command,'UPDATE_CERTIFICATION_TYPE','CertificationType',type_id,tenant,actor,payload_hash,response,changed.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','CERTIFICATION_TYPE_CONFLICT'); WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_set_certification_type_active(command jsonb, desired_active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); type_id text=nullif(btrim(command->>'certificationTypeId'),''); expected bigint; prior erp.certification_types; changed erp.certification_types; action_name text=CASE WHEN desired_active THEN 'CERTIFICATION_TYPE_ACTIVATED' ELSE 'CERTIFICATION_TYPE_DEACTIVATED' END; command_name text=CASE WHEN desired_active THEN 'ACTIVATE_CERTIFICATION_TYPE' ELSE 'DEACTIVATE_CERTIFICATION_TYPE' END; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_certification_actor('masterData.manage'); IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','certificationTypeId','expectedRowVersion')) OR type_id IS NULL OR jsonb_typeof(command->'expectedRowVersion')<>'number' OR command->>'expectedRowVersion' !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; expected=(command->>'expectedRowVersion')::bigint;
  SELECT * INTO prior FROM erp.certification_types WHERE id=type_id AND company_id=tenant FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF; IF prior.row_version<>expected THEN RETURN jsonb_build_object('success',false,'code','CONFLICT'); END IF;
  idem=erp.begin_operational_command(command,command_name,'CertificationType',type_id,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  UPDATE erp.certification_types SET active=desired_active,updated_by=actor WHERE id=type_id AND company_id=tenant RETURNING * INTO changed;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'CertificationType',type_id,action_name,actor,now_at,command->>'commandId',jsonb_build_object('active',prior.active,'rowVersion',prior.row_version),jsonb_build_object('active',changed.active,'rowVersion',changed.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(type_id),'value',jsonb_build_object('id',changed.id,'name',changed.name,'active',changed.active,'rowVersion',changed.row_version)); RETURN erp.finish_operational_command(command,command_name,'CertificationType',type_id,tenant,actor,payload_hash,response,changed.row_version);
EXCEPTION WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_activate_certification_type(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$ SELECT erp.command_set_certification_type_active(command,true) $$;
CREATE OR REPLACE FUNCTION erp.command_deactivate_certification_type(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$ SELECT erp.command_set_certification_type_active(command,false) $$;

CREATE OR REPLACE FUNCTION erp.command_assign_operator_certification(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); operator_id_value text=nullif(btrim(command->>'operatorId'),''); type_id text=nullif(btrim(command->>'certificationTypeId'),''); assigned erp.operator_certifications; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_certification_actor('operator.manage'); IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','operatorId','certificationTypeId')) OR operator_id_value IS NULL OR type_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.operators WHERE id=operator_id_value AND company_id=tenant) OR NOT EXISTS(SELECT 1 FROM erp.certification_types WHERE id=type_id AND company_id=tenant) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF; IF NOT EXISTS(SELECT 1 FROM erp.certification_types WHERE id=type_id AND company_id=tenant AND active) THEN RETURN jsonb_build_object('success',false,'code','CERTIFICATION_TYPE_INACTIVE'); END IF;
  idem=erp.begin_operational_command(command,'ASSIGN_OPERATOR_CERTIFICATION','Operator',operator_id_value,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO erp.operator_certifications(operator_id,certification_type_id,company_id,created_by,updated_by) VALUES(operator_id_value,type_id,tenant,actor,actor) RETURNING * INTO assigned;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'Operator',operator_id_value,'OPERATOR_CERTIFICATION_ASSIGNED',actor,now_at,command->>'commandId',jsonb_build_object('certificationTypeId',type_id));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(operator_id_value),'value',jsonb_build_object('operatorId',assigned.operator_id,'certificationTypeId',assigned.certification_type_id,'rowVersion',assigned.row_version)); RETURN erp.finish_operational_command(command,'ASSIGN_OPERATOR_CERTIFICATION','Operator',operator_id_value,tenant,actor,payload_hash,response,assigned.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','CERTIFICATION_ALREADY_ASSIGNED'); WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_remove_operator_certification(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); operator_id_value text=nullif(btrim(command->>'operatorId'),''); type_id text=nullif(btrim(command->>'certificationTypeId'),''); prior erp.operator_certifications; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_certification_actor('operator.manage'); IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','operatorId','certificationTypeId')) OR operator_id_value IS NULL OR type_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO prior FROM erp.operator_certifications WHERE operator_id=operator_id_value AND certification_type_id=type_id AND company_id=tenant FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=erp.begin_operational_command(command,'REMOVE_OPERATOR_CERTIFICATION','Operator',operator_id_value,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  DELETE FROM erp.operator_certifications WHERE operator_id=operator_id_value AND certification_type_id=type_id AND company_id=tenant;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values) VALUES(extensions.gen_random_uuid()::text,tenant,'Operator',operator_id_value,'OPERATOR_CERTIFICATION_REMOVED',actor,now_at,command->>'commandId',jsonb_build_object('certificationTypeId',type_id,'rowVersion',prior.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(operator_id_value),'value',jsonb_build_object('operatorId',operator_id_value,'certificationTypeId',type_id)); RETURN erp.finish_operational_command(command,'REMOVE_OPERATOR_CERTIFICATION','Operator',operator_id_value,tenant,actor,payload_hash,response,prior.row_version);
EXCEPTION WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

ALTER FUNCTION erp.validate_operator_certification_tenant() OWNER TO postgres;
ALTER FUNCTION erp.require_certification_actor(text) OWNER TO postgres;
ALTER FUNCTION erp.list_certification_types(boolean) OWNER TO postgres;
ALTER FUNCTION erp.list_assignable_certification_types() OWNER TO postgres;
ALTER FUNCTION erp.list_operator_certifications(text) OWNER TO postgres;
ALTER FUNCTION erp.command_create_certification_type(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_update_certification_type(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_set_certification_type_active(jsonb,boolean) OWNER TO postgres;
ALTER FUNCTION erp.command_activate_certification_type(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_deactivate_certification_type(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_assign_operator_certification(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_remove_operator_certification(jsonb) OWNER TO postgres;
REVOKE ALL ON TABLE erp.certification_types,erp.operator_certifications FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.validate_operator_certification_tenant(),erp.require_certification_actor(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.list_certification_types(boolean),erp.list_assignable_certification_types(),erp.list_operator_certifications(text),erp.command_create_certification_type(jsonb),erp.command_update_certification_type(jsonb),erp.command_set_certification_type_active(jsonb,boolean),erp.command_activate_certification_type(jsonb),erp.command_deactivate_certification_type(jsonb),erp.command_assign_operator_certification(jsonb),erp.command_remove_operator_certification(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.list_certification_types(boolean),erp.list_assignable_certification_types(),erp.list_operator_certifications(text),erp.command_create_certification_type(jsonb),erp.command_update_certification_type(jsonb),erp.command_activate_certification_type(jsonb),erp.command_deactivate_certification_type(jsonb),erp.command_assign_operator_certification(jsonb),erp.command_remove_operator_certification(jsonb) TO authenticated;

COMMIT;
