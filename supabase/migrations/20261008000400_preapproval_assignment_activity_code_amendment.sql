BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Use the canonical Assignment update grant and permit revisions only during Draft preparation.
CREATE OR REPLACE FUNCTION erp.command_amend_assignment_activity_code(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
  target erp.assignments%ROWTYPE; activity erp.activity_codes%ROWTYPE;
  idem jsonb; payload_hash text; response jsonb; prior text;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
  ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('assignment.update') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','userId','equipmentId','operatorId','projectId','status','assignedDate','expectedReturn']
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'assignmentId'),'') IS NULL OR nullif(btrim(command->>'activityCodeId'),'') IS NULL
    OR command->>'assignmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR command->>'expectedVersion' !~ '^[0-9]+$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO target FROM erp.assignments
  WHERE id=command->>'assignmentId' AND company_id=tenant AND deleted_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;

  -- Lock the linked parents and lines so approval or release cannot pass the check concurrently.
  PERFORM 1 FROM erp.rentals r WHERE r.company_id=tenant AND (
    r.assignment_id=target.id OR EXISTS(
      SELECT 1 FROM erp.rental_equipment_lines l WHERE l.rental_id=r.id
        AND l.company_id=tenant AND l.assignment_id=target.id AND l.deleted_at IS NULL
    )) FOR UPDATE;
  PERFORM 1 FROM erp.rental_equipment_lines l WHERE l.company_id=tenant
    AND l.assignment_id=target.id AND l.deleted_at IS NULL FOR UPDATE;

  IF EXISTS(
    SELECT 1 FROM erp.rentals r WHERE r.company_id=tenant
      AND (r.assignment_id=target.id OR EXISTS(
        SELECT 1 FROM erp.rental_equipment_lines l WHERE l.rental_id=r.id
          AND l.company_id=tenant AND l.assignment_id=target.id AND l.deleted_at IS NULL))
      AND r.approval_status='Approved'
  ) THEN RETURN jsonb_build_object('success',false,'code','APPROVED_LOCKED'); END IF;

  IF EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.assignment_id=target.id)
    OR EXISTS(
      SELECT 1 FROM erp.rentals r WHERE r.company_id=tenant
        AND (r.assignment_id=target.id OR EXISTS(
          SELECT 1 FROM erp.rental_equipment_lines l WHERE l.rental_id=r.id
            AND l.company_id=tenant AND l.assignment_id=target.id AND l.deleted_at IS NULL))
        AND (r.status<>'Draft' OR coalesce(r.canonical_parent_status::text,r.status::text)<>'Draft'
          OR r.reserved_at IS NOT NULL OR r.released_at IS NOT NULL OR r.activated_at IS NOT NULL
          OR r.returned_at IS NOT NULL OR r.closed_at IS NOT NULL
          OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l WHERE l.rental_id=r.id
            AND l.company_id=tenant AND l.deleted_at IS NULL
            AND (l.status<>'Draft' OR coalesce(l.canonical_line_status::text,l.status::text)<>'Draft'))
          OR EXISTS(SELECT 1 FROM erp.rental_contracts c WHERE c.rental_id=r.id
            AND c.status NOT IN ('Draft','Cancelled'))
          OR EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_id=r.id))
    ) THEN RETURN jsonb_build_object('success',false,'code','DEPENDENCY_CONFLICT'); END IF;

  idem=erp.begin_operational_command(command,'AMEND_ASSIGNMENT_ACTIVITY_CODE','ASSIGNMENT',target.id,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF target.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);
  END IF;
  IF target.status<>'Active' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT * INTO activity FROM erp.activity_codes
  WHERE id=command->>'activityCodeId' AND active AND deleted_at IS NULL;
  IF activity.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;

  prior=target.activity_code_id;
  UPDATE erp.assignments SET activity_code_id=activity.id,updated_by=actor
  WHERE id=target.id AND company_id=tenant RETURNING * INTO target;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,
    correlation_id,previous_values,new_values,metadata)
  VALUES(gen_random_uuid()::text,tenant,'Assignment',target.id,'ASSIGNMENT_ACTIVITY_CODE_AMENDED',actor,now_at,
    command->>'commandId',jsonb_build_object('activityCodeId',prior),
    jsonb_build_object('activityCodeId',target.activity_code_id),
    jsonb_build_object('authorizedPermission','assignment.update','roles',
      (SELECT coalesce(jsonb_agg(role_code ORDER BY role_code),'[]'::jsonb) FROM erp.current_user_roles()),
      'idempotencyKey',command->>'idempotencyKey','reason',nullif(btrim(command->>'reason'),'')));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'refresh',jsonb_build_array(target.id),
    'value',jsonb_build_object('id',target.id,'activityCodeId',target.activity_code_id,'rowVersion',target.row_version));
  RETURN erp.finish_operational_command(command,'AMEND_ASSIGNMENT_ACTIVITY_CODE','ASSIGNMENT',target.id,
    tenant,actor,payload_hash,response,target.row_version);
END $$;
ALTER FUNCTION erp.command_amend_assignment_activity_code(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_amend_assignment_activity_code(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_amend_assignment_activity_code(jsonb) TO authenticated;
COMMIT;
