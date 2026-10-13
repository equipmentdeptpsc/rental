BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Project reviewers are configuration, not login users. Dispatch must take an
-- immutable copy of these addresses; editing this row never changes history.
CREATE TABLE erp.project_customer_review_recipients (
  company_id text NOT NULL,
  project_id text NOT NULL,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  PRIMARY KEY(company_id,project_id),
  FOREIGN KEY(company_id,project_id) REFERENCES erp.projects(company_id,id),
  CONSTRAINT project_review_recipients_array CHECK (jsonb_typeof(recipients)='array' AND jsonb_array_length(recipients)<=10),
  CONSTRAINT project_review_recipients_version CHECK (row_version>0)
);
ALTER TABLE erp.project_customer_review_recipients OWNER TO postgres;
ALTER TABLE erp.project_customer_review_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.project_customer_review_recipients FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.read_project_customer_review_recipients(target_project_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); result jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.company_id=tenant AND u.status='active' AND c.active
  ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT erp.current_user_has_permission('project.read') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM erp.projects p WHERE p.company_id=tenant AND p.id=target_project_id AND p.active AND p.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT jsonb_build_object('projectId',target_project_id,'recipients',r.recipients,'rowVersion',r.row_version)
  INTO result FROM erp.project_customer_review_recipients r
  WHERE r.company_id=tenant AND r.project_id=target_project_id;
  RETURN coalesce(result,jsonb_build_object('projectId',target_project_id,'recipients','[]'::jsonb,'rowVersion',0));
END $$;

CREATE FUNCTION erp.command_update_project_customer_review_recipients(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
  target erp.projects; current_row erp.project_customer_review_recipients;
  proposed jsonb='[]'::jsonb; entry jsonb; seen text[]='{}'; address text; display_name text;
  expected bigint; idem jsonb; response jsonb; payload_hash text; next_version bigint;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.company_id=tenant AND u.status='active' AND c.active
  ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('project.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN ('commandId','idempotencyKey','projectId','expectedVersion','recipients')
  ) OR nullif(btrim(command->>'commandId'),'') IS NULL
    OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'projectId'),'') IS NULL
    OR coalesce(jsonb_typeof(command->'recipients'),'')<>'array'
    OR jsonb_array_length(command->'recipients')>10
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN expected=(command->>'expectedVersion')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END;
  IF expected<0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(command->'recipients') LOOP
    IF coalesce(jsonb_typeof(entry),'')<>'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(entry) key WHERE key NOT IN ('name','email'))
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    display_name=btrim(entry->>'name'); address=lower(btrim(entry->>'email'));
    IF coalesce(length(display_name),0) NOT BETWEEN 1 AND 120 OR coalesce(length(address),0) NOT BETWEEN 3 AND 254
      OR address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR address=ANY(seen)
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    seen=array_append(seen,address);
    proposed=proposed||jsonb_build_array(jsonb_build_object('name',display_name,'email',address));
  END LOOP;

  idem=erp.begin_operational_command(command,'UPDATE_PROJECT_CUSTOMER_REVIEW_RECIPIENTS','PROJECT',command->>'projectId',tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT * INTO target FROM erp.projects WHERE company_id=tenant AND id=command->>'projectId' FOR UPDATE;
  IF target.id IS NULL OR NOT target.active OR target.deleted_at IS NOT NULL OR target.customer_id IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO current_row FROM erp.project_customer_review_recipients
  WHERE company_id=tenant AND project_id=target.id FOR UPDATE;
  IF expected<>coalesce(current_row.row_version,0)
  THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',coalesce(current_row.row_version,0)); END IF;
  IF current_row.project_id IS NULL THEN
    INSERT INTO erp.project_customer_review_recipients(company_id,project_id,recipients,updated_at,updated_by)
    VALUES(tenant,target.id,proposed,now_at,actor);
    next_version=1;
  ELSE
    UPDATE erp.project_customer_review_recipients
    SET recipients=proposed,row_version=row_version+1,updated_at=now_at,updated_by=actor
    WHERE company_id=tenant AND project_id=target.id RETURNING row_version INTO next_version;
  END IF;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'Project',target.id,'PROJECT_CUSTOMER_REVIEW_RECIPIENTS_UPDATED',actor,now_at,
    command->>'commandId',jsonb_build_object('recipientCount',coalesce(jsonb_array_length(current_row.recipients),0),'rowVersion',coalesce(current_row.row_version,0)),
    jsonb_build_object('recipientCount',jsonb_array_length(proposed),'rowVersion',next_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id),
    'value',jsonb_build_object('projectId',target.id,'recipients',proposed,'rowVersion',next_version));
  RETURN erp.finish_operational_command(command,'UPDATE_PROJECT_CUSTOMER_REVIEW_RECIPIENTS','PROJECT',target.id,tenant,actor,payload_hash,response,next_version);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
END $$;

ALTER FUNCTION erp.read_project_customer_review_recipients(text) OWNER TO postgres;
ALTER FUNCTION erp.command_update_project_customer_review_recipients(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_project_customer_review_recipients(text),erp.command_update_project_customer_review_recipients(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_project_customer_review_recipients(text),erp.command_update_project_customer_review_recipients(jsonb)
  TO authenticated;
COMMIT;
