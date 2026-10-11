BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE FUNCTION erp.command_revise_assignment(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 target erp.assignments%ROWTYPE; changed erp.assignments%ROWTYPE; equipment_row erp.equipment%ROWTYPE;
 operator_row erp.operators%ROWTYPE; project_row erp.projects%ROWTYPE; assigned_on date; expected_on date;
 expected_version bigint; prior jsonb; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
 IF NOT erp.current_user_has_permission('assignment.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF command IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN
  ('commandId','idempotencyKey','assignmentId','operatorId','projectId','assignedDate','expectedReturn','remarks','expectedVersion'))
  OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
  OR nullif(btrim(command->>'assignmentId'),'') IS NULL OR nullif(btrim(command->>'operatorId'),'') IS NULL
  OR nullif(btrim(command->>'projectId'),'') IS NULL OR nullif(btrim(command->>'assignedDate'),'') IS NULL
  OR command->>'expectedVersion' !~ '^[0-9]+$' OR length(coalesce(command->>'remarks',''))>2000
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 BEGIN assigned_on=(command->>'assignedDate')::date; expected_on=nullif(command->>'expectedReturn','')::date;
  expected_version=(command->>'expectedVersion')::bigint;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
 IF expected_on IS NOT NULL AND expected_on<assigned_on THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO target FROM erp.assignments WHERE id=command->>'assignmentId' AND company_id=tenant AND deleted_at IS NULL FOR UPDATE;
 IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
 IF target.status<>'Active' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
 IF target.operator_id<>command->>'operatorId' AND NOT erp.current_user_has_permission('assignment.operator.replace')
 THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 -- A linked Rental or DEUR is an immutable lineage boundary, even while Draft.
 PERFORM 1 FROM erp.rentals r WHERE r.company_id=tenant AND r.assignment_id=target.id FOR UPDATE;
 PERFORM 1 FROM erp.rental_equipment_lines l WHERE l.company_id=tenant AND l.assignment_id=target.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM erp.rentals r WHERE r.company_id=tenant AND r.assignment_id=target.id)
  OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l WHERE l.company_id=tenant AND l.assignment_id=target.id)
  OR EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.assignment_id=target.id)
 THEN RETURN jsonb_build_object('success',false,'code','DEPENDENCY_CONFLICT'); END IF;
 idem=erp.begin_operational_command(command,'REVISE_ASSIGNMENT','ASSIGNMENT',target.id,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 payload_hash=idem->>'payloadHash';
 IF target.row_version<>expected_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version); END IF;
 SELECT * INTO equipment_row FROM erp.equipment WHERE id=target.equipment_id AND company_id=tenant AND active AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO operator_row FROM erp.operators WHERE id=command->>'operatorId' AND company_id=tenant AND status='Active' AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO project_row FROM erp.projects WHERE id=command->>'projectId' AND company_id=tenant AND active AND deleted_at IS NULL;
 IF equipment_row.id IS NULL OR operator_row.id IS NULL OR project_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
 IF EXISTS(SELECT 1 FROM erp.assignments a WHERE a.company_id=tenant AND a.id<>target.id AND a.operator_id=operator_row.id AND a.status='Active' AND a.deleted_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_ALREADY_ASSIGNED'); END IF;
 prior=jsonb_build_object('operatorId',target.operator_id,'projectId',target.project_id,'assignedDate',target.assigned_date,'expectedReturn',target.expected_return,'remarks',target.remarks,'rowVersion',target.row_version);
 UPDATE erp.assignments SET operator_id=operator_row.id,project_id=project_row.id,assigned_date=assigned_on,expected_return=expected_on,remarks=coalesce(command->>'remarks',''),updated_by=actor
 WHERE id=target.id AND company_id=tenant RETURNING * INTO changed;
 UPDATE erp.equipment SET operator_id=operator_row.id,project_id=project_row.id,updated_by=actor WHERE id=equipment_row.id AND company_id=tenant;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
 VALUES(extensions.gen_random_uuid()::text,tenant,'Assignment',changed.id,'ASSIGNMENT_REVISED',actor,now_at,command->>'commandId',prior,
 jsonb_build_object('operatorId',changed.operator_id,'projectId',changed.project_id,'assignedDate',changed.assigned_date,'expectedReturn',changed.expected_return,'remarks',changed.remarks,'rowVersion',changed.row_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(changed.id,changed.equipment_id),
 'value',jsonb_build_object('id',changed.id,'companyId',changed.company_id,'equipmentId',changed.equipment_id,'operatorId',changed.operator_id,'projectId',changed.project_id,
 'activityCodeId',changed.activity_code_id,'assignedDate',changed.assigned_date,'expectedReturn',changed.expected_return,'remarks',changed.remarks,'status',changed.status,
 'createdAt',changed.created_at,'updatedAt',changed.updated_at,'rowVersion',changed.row_version));
 RETURN erp.finish_operational_command(command,'REVISE_ASSIGNMENT','ASSIGNMENT',changed.id,tenant,actor,payload_hash,response,changed.row_version);
EXCEPTION WHEN unique_violation THEN GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_assignment_active_operator' THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_ALREADY_ASSIGNED'); END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_INTERVAL_CONFLICT');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
END $$;
ALTER FUNCTION erp.command_revise_assignment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_revise_assignment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_revise_assignment(jsonb) TO authenticated;
COMMIT;
