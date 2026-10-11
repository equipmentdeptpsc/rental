BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- System Administrator is the sole catalog-wide role.  Keep its mapping in
-- the same role_permissions authority table consumed by RLS helpers, RPCs,
-- effective-permission reads, and the remote Roles screen.
CREATE TEMP TABLE uat_operations_authority_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM erp.user_roles) AS user_role_count,
  (SELECT count(*) FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id WHERE role.code <> 'system-administrator') AS non_administrator_mapping_count,
  (SELECT md5(coalesce(string_agg(role.code || ':' || permission.code, ',' ORDER BY role.code, permission.code), ''))
     FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id
     WHERE role.code <> 'system-administrator') AS non_administrator_mapping_hash;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT administrator.id, permission.id
FROM erp.app_roles administrator
CROSS JOIN erp.app_permissions permission
WHERE administrator.code='system-administrator' AND administrator.active AND permission.active
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION erp.grant_catalog_permission_to_system_administrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
BEGIN
  IF NEW.active THEN
    INSERT INTO erp.role_permissions(role_id,permission_id)
    SELECT role.id,NEW.id FROM erp.app_roles role
    WHERE role.code='system-administrator' AND role.active
    ON CONFLICT(role_id,permission_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS grant_catalog_permission_to_system_administrator ON erp.app_permissions;
CREATE TRIGGER grant_catalog_permission_to_system_administrator
  AFTER INSERT OR UPDATE OF active ON erp.app_permissions
  FOR EACH ROW EXECUTE FUNCTION erp.grant_catalog_permission_to_system_administrator();

CREATE OR REPLACE FUNCTION erp.reconcile_reactivated_system_administrator_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
BEGIN
  IF NEW.code='system-administrator' AND NEW.active AND NOT OLD.active THEN
    INSERT INTO erp.role_permissions(role_id,permission_id)
    SELECT NEW.id,permission.id FROM erp.app_permissions permission WHERE permission.active
    ON CONFLICT(role_id,permission_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reconcile_reactivated_system_administrator_permissions ON erp.app_roles;
CREATE TRIGGER reconcile_reactivated_system_administrator_permissions
  AFTER UPDATE OF active ON erp.app_roles
  FOR EACH ROW EXECUTE FUNCTION erp.reconcile_reactivated_system_administrator_permissions();

DO $$
DECLARE baseline uat_operations_authority_baseline%ROWTYPE;
BEGIN
  SELECT * INTO baseline FROM uat_operations_authority_baseline;
  IF EXISTS(SELECT 1 FROM erp.app_roles WHERE code='system-administrator' AND active)
     AND (SELECT count(*) FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code='system-administrator' AND role.active AND permission.active)
     <> (SELECT count(*) FROM erp.app_permissions WHERE active) THEN
    RAISE EXCEPTION 'System Administrator permission coverage is incomplete';
  END IF;
  IF (SELECT count(*) FROM erp.user_roles) <> baseline.user_role_count THEN RAISE EXCEPTION 'User role assignments must not change'; END IF;
  IF (SELECT count(*) FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id WHERE role.code <> 'system-administrator') <> baseline.non_administrator_mapping_count
     OR (SELECT md5(coalesce(string_agg(role.code || ':' || permission.code, ',' ORDER BY role.code, permission.code), '')) FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code <> 'system-administrator') IS DISTINCT FROM baseline.non_administrator_mapping_hash THEN
    RAISE EXCEPTION 'Non-administrator role mappings must not change';
  END IF;
END $$;

-- The command creates a linked Assignment and line reference in one database
-- transaction.  The tenant-aware FK must be deferred only for that short
-- transaction because the line is deliberately linked before its new Active
-- Assignment is inserted.
ALTER TABLE erp.rental_equipment_lines DROP CONSTRAINT IF EXISTS rental_equipment_lines_assignment_id_fkey;
ALTER TABLE erp.rental_equipment_lines DROP CONSTRAINT IF EXISTS fk_lines_company_assignment;
ALTER TABLE erp.rental_equipment_lines ADD CONSTRAINT fk_lines_company_assignment
  FOREIGN KEY(company_id,assignment_id) REFERENCES erp.assignments(company_id,id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION erp.enforce_assignment_commitment_interval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,pg_catalog
AS $$
DECLARE linked_line_id text;
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.status='Active' THEN
    SELECT line.id INTO linked_line_id
    FROM erp.rental_equipment_lines line
    JOIN erp.rentals rental ON rental.id=line.rental_id AND rental.company_id=line.company_id
    WHERE line.company_id=NEW.company_id AND line.assignment_id=NEW.id AND line.equipment_id=NEW.equipment_id
      AND line.deleted_at IS NULL
      AND erp.rental_line_is_committing(line.status,line.canonical_line_status,rental.status,rental.canonical_parent_status)
      AND erp.rental_line_commitment_start(line.effective_start_date,rental.date_out)=NEW.assigned_date
      AND erp.rental_line_commitment_end(line.actual_return_date,rental.expected_return) IS NOT DISTINCT FROM NEW.expected_return
    ORDER BY line.id
    LIMIT 1;
    PERFORM erp.assert_equipment_interval_available(NEW.company_id,NEW.equipment_id,NEW.assigned_date,NEW.expected_return,linked_line_id,NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_assignment_commitment_interval ON erp.assignments;
CREATE TRIGGER enforce_assignment_commitment_interval
  BEFORE INSERT OR UPDATE OF equipment_id,status,assigned_date,expected_return,deleted_at ON erp.assignments
  FOR EACH ROW EXECUTE FUNCTION erp.enforce_assignment_commitment_interval();

CREATE OR REPLACE FUNCTION erp.command_configure_rental_line_assignment(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
DECLARE
  tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
  target erp.rentals%ROWTYPE; line_row erp.rental_equipment_lines%ROWTYPE; assignment_row erp.assignments%ROWTYPE;
  operator_row erp.operators%ROWTYPE; activity_row erp.activity_codes%ROWTYPE; equipment_row erp.equipment%ROWTYPE;
  conflicting_assignment erp.assignments%ROWTYPE;
  effective_on date; expected_on date; assignment_id_value text; expected_version_value bigint;
  idem jsonb; payload_hash text; response jsonb; previous_values jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(SELECT 1 FROM erp.users user_row JOIN erp.companies company ON company.id=user_row.company_id WHERE user_row.id=auth.uid() AND user_row.status='active' AND user_row.company_id=tenant AND company.active) THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');
  END IF;
  IF NOT erp.current_user_has_permission('rental.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN ('commandId','idempotencyKey','rentalId','rentalLineId','expectedVersion','operatorId','effectiveStartDate','activityCodeId'))
    OR command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id','assignmentId','equipmentId','projectId','status']
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'rentalId'),'') IS NULL OR nullif(btrim(command->>'rentalLineId'),'') IS NULL
    OR nullif(btrim(command->>'operatorId'),'') IS NULL OR nullif(btrim(command->>'effectiveStartDate'),'') IS NULL
    OR command->>'expectedVersion' !~ '^[0-9]+$'
    OR (command ? 'activityCodeId' AND command->'activityCodeId' <> 'null'::jsonb AND nullif(btrim(command->>'activityCodeId'),'') IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  BEGIN effective_on=(command->>'effectiveStartDate')::date; expected_version_value=(command->>'expectedVersion')::bigint; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;

  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF target.status<>'Draft' OR coalesce(target.canonical_parent_status::text,target.status::text)<>'Draft' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF target.approval_status='Approved' THEN RETURN jsonb_build_object('success',false,'code','PARENT_READ_ONLY'); END IF;
  IF target.row_version<>expected_version_value THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version); END IF;
  IF effective_on<target.date_out OR (target.expected_return IS NOT NULL AND effective_on>target.expected_return) THEN RETURN jsonb_build_object('success',false,'code','INVALID_EFFECTIVE_START'); END IF;

  SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=command->>'rentalLineId' AND rental_id=target.id AND company_id=tenant AND deleted_at IS NULL FOR UPDATE;
  IF line_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF coalesce(line_row.canonical_line_status::text,line_row.status::text)<>'Draft' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF EXISTS(SELECT 1 FROM erp.deurs deur WHERE deur.company_id=tenant AND deur.rental_equipment_line_id=line_row.id)
    OR EXISTS(SELECT 1 FROM erp.billing_statement_lines billing_line WHERE billing_line.rental_equipment_line_id=line_row.id) THEN
    RETURN jsonb_build_object('success',false,'code','PARENT_READ_ONLY');
  END IF;

  idem=erp.begin_operational_command(command,'CONFIGURE_RENTAL_LINE_ASSIGNMENT','RENTAL',target.id,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash'; expected_on=target.expected_return;

  SELECT * INTO equipment_row FROM erp.equipment WHERE id=line_row.equipment_id AND company_id=tenant AND active AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO operator_row FROM erp.operators WHERE id=command->>'operatorId' AND company_id=tenant AND status='Active' AND deleted_at IS NULL FOR UPDATE;
  IF equipment_row.id IS NULL OR operator_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF line_row.assignment_id IS NULL THEN
    IF NOT erp.current_user_has_permission('assignment.create') OR nullif(btrim(command->>'activityCodeId'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
    SELECT * INTO activity_row FROM erp.activity_codes WHERE id=command->>'activityCodeId' AND active AND deleted_at IS NULL;
    IF activity_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
    assignment_id_value=extensions.gen_random_uuid()::text;
    SELECT * INTO conflicting_assignment FROM erp.assignments existing
    WHERE existing.company_id=tenant AND existing.operator_id=operator_row.id AND existing.status='Active' AND existing.deleted_at IS NULL
    ORDER BY existing.assigned_date,existing.id LIMIT 1;
    IF conflicting_assignment.id IS NOT NULL THEN
      response=jsonb_build_object('success',false,'code','OPERATOR_ALREADY_ASSIGNED');
      IF erp.current_user_has_permission('assignment.read') THEN
        response=response||jsonb_build_object('details',jsonb_strip_nulls(jsonb_build_object('assignmentId',conflicting_assignment.id,'status',conflicting_assignment.status,'assignedDate',conflicting_assignment.assigned_date,'expectedReturn',conflicting_assignment.expected_return)));
      END IF;
      RETURN response;
    END IF;
    previous_values=jsonb_build_object('assignmentId',NULL,'operatorId',line_row.operator_id,'effectiveStartDate',line_row.effective_start_date);
    SET CONSTRAINTS fk_lines_company_assignment DEFERRED;
    UPDATE erp.rental_equipment_lines SET assignment_id=assignment_id_value,operator_id=operator_row.id,effective_start_date=effective_on,updated_by=actor WHERE id=line_row.id AND company_id=tenant RETURNING * INTO line_row;
    INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,remarks,status,created_by,updated_by,company_id)
    VALUES(assignment_id_value,line_row.equipment_id,operator_row.id,target.project_id,activity_row.id,effective_on,expected_on,'Configured from Rental Workspace','Active',actor,actor,tenant)
    RETURNING * INTO assignment_row;
  ELSE
    IF NOT erp.current_user_has_permission('assignment.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
    SELECT * INTO assignment_row FROM erp.assignments WHERE id=line_row.assignment_id AND company_id=tenant AND deleted_at IS NULL FOR UPDATE;
    IF assignment_row.id IS NULL OR assignment_row.status<>'Active' OR assignment_row.equipment_id<>line_row.equipment_id OR assignment_row.project_id<>target.project_id THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP'); END IF;
    IF assignment_row.operator_id<>operator_row.id AND NOT erp.current_user_has_permission('assignment.operator.replace') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
    SELECT * INTO conflicting_assignment FROM erp.assignments existing
    WHERE existing.company_id=tenant AND existing.operator_id=operator_row.id AND existing.id<>assignment_row.id AND existing.status='Active' AND existing.deleted_at IS NULL
    ORDER BY existing.assigned_date,existing.id LIMIT 1;
    IF conflicting_assignment.id IS NOT NULL THEN
      response=jsonb_build_object('success',false,'code','OPERATOR_ALREADY_ASSIGNED');
      IF erp.current_user_has_permission('assignment.read') THEN
        response=response||jsonb_build_object('details',jsonb_strip_nulls(jsonb_build_object('assignmentId',conflicting_assignment.id,'status',conflicting_assignment.status,'assignedDate',conflicting_assignment.assigned_date,'expectedReturn',conflicting_assignment.expected_return)));
      END IF;
      RETURN response;
    END IF;
    previous_values=jsonb_build_object('assignmentId',assignment_row.id,'operatorId',assignment_row.operator_id,'effectiveStartDate',line_row.effective_start_date);
    UPDATE erp.rental_equipment_lines SET operator_id=operator_row.id,effective_start_date=effective_on,updated_by=actor WHERE id=line_row.id AND company_id=tenant RETURNING * INTO line_row;
    UPDATE erp.assignments SET operator_id=operator_row.id,assigned_date=effective_on,expected_return=expected_on,updated_by=actor WHERE id=assignment_row.id AND company_id=tenant RETURNING * INTO assignment_row;
    assignment_id_value=assignment_row.id;
  END IF;
  UPDATE erp.equipment SET status_id=(SELECT id FROM erp.equipment_statuses WHERE lower(code)='assigned' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1),project_id=target.project_id,operator_id=operator_row.id,updated_by=actor WHERE id=equipment_row.id AND company_id=tenant;
  UPDATE erp.rentals SET approval_status='NotSubmitted',approval_requested_at=NULL,approval_requested_by=NULL,approval_decided_at=NULL,approval_decided_by=NULL,approval_decision_remarks=NULL,updated_by=actor WHERE id=target.id AND company_id=tenant RETURNING * INTO target;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'RentalEquipmentLine',line_row.id,'RENTAL_LINE_ASSIGNMENT_CONFIGURED',actor,now_at,command->>'commandId',previous_values,jsonb_build_object('rentalId',target.id,'assignmentId',assignment_id_value,'operatorId',operator_row.id,'effectiveStartDate',effective_on,'assignmentVersion',assignment_row.row_version,'rentalVersion',target.row_version),jsonb_build_object('source','RentalWorkspace'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id,line_row.id,line_row.equipment_id,assignment_id_value,operator_row.id),'value',jsonb_build_object('rentalId',target.id,'rentalLineId',line_row.id,'assignmentId',assignment_id_value,'operatorId',operator_row.id,'effectiveStartDate',effective_on,'status',target.status,'approvalStatus',target.approval_status,'version',target.row_version));
  RETURN erp.finish_operational_command(command,'CONFIGURE_RENTAL_LINE_ASSIGNMENT','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_INTERVAL_CONFLICT');
WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

ALTER FUNCTION erp.command_configure_rental_line_assignment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_configure_rental_line_assignment(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_configure_rental_line_assignment(jsonb) TO authenticated;

COMMIT;
