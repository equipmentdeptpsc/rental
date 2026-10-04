BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- This permission is intentionally separate from deur.create.  The latter is
-- an operator-custody permission and must not become an office-user bypass.
INSERT INTO erp.app_permissions(id,code,name,resource,action,catalog_version,active,deprecated_at,replacement_permission,risk_class)
VALUES(
  extensions.gen_random_uuid()::text,
  'deur.manual.create',
  'Create a canonical manual DEUR from a physical form',
  'deur',
  'manual.create',
  '2.0-extension',
  true,
  NULL,
  ARRAY[]::text[],
  'APPROVAL'
)
ON CONFLICT(code) DO UPDATE
SET name=EXCLUDED.name,resource=EXCLUDED.resource,action=EXCLUDED.action,
    catalog_version=EXCLUDED.catalog_version,active=true,deprecated_at=NULL,
    replacement_permission=ARRAY[]::text[],risk_class=EXCLUDED.risk_class;
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role_record.id,permission_record.id
FROM erp.app_roles AS role_record
CROSS JOIN erp.app_permissions AS permission_record
WHERE role_record.code IN ('system-administrator','operations-manager')
  AND role_record.active
  AND role_record.deprecated_at IS NULL
  AND permission_record.code='deur.manual.create'
ON CONFLICT DO NOTHING;
-- Remove any accidental grant, including an Operator grant, so the command's
-- authorization remains office-encoder-only.
DELETE FROM erp.role_permissions AS mapping
USING erp.app_roles AS role_record,erp.app_permissions AS permission_record
WHERE mapping.role_id=role_record.id
  AND mapping.permission_id=permission_record.id
  AND permission_record.code='deur.manual.create'
  AND role_record.code NOT IN ('system-administrator','operations-manager');
CREATE OR REPLACE FUNCTION erp.validate_manual_deur_create_scope(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
DECLARE
  tenant text:=erp.current_company_id();
  actor uuid:=auth.uid();
  application_user erp.users%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  target_rental erp.rentals%ROWTYPE;
  target_assignment erp.assignments%ROWTYPE;
  target_operator erp.operators%ROWTYPE;
  target_equipment erp.equipment%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF actor IS NULL OR tenant IS NULL THEN
    RETURN jsonb_build_object('code','UNAUTHENTICATED');
  END IF;

  SELECT * INTO application_user
  FROM erp.users AS user_record
  WHERE user_record.id=actor AND user_record.company_id=tenant AND user_record.status='active';
  IF application_user.id IS NULL THEN
    RETURN jsonb_build_object('code','USER_INACTIVE');
  END IF;
  IF NOT erp.current_user_has_permission('deur.manual.create') THEN
    RETURN jsonb_build_object('code','FORBIDDEN');
  END IF;
  IF nullif(btrim(command->>'rentalLineId'),'') IS NULL THEN
    RETURN jsonb_build_object('code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO target_line
  FROM erp.rental_equipment_lines AS line_record
  WHERE line_record.id=command->>'rentalLineId'
    AND line_record.company_id=tenant
    AND line_record.deleted_at IS NULL
  FOR SHARE;
  IF target_line.id IS NULL OR target_line.status NOT IN ('Released','Active') THEN
    RETURN jsonb_build_object('code','RENTAL_LINE_INACTIVE');
  END IF;

  SELECT * INTO target_rental
  FROM erp.rentals AS rental_record
  WHERE rental_record.id=target_line.rental_id AND rental_record.company_id=tenant
  FOR SHARE;
  IF target_rental.id IS NULL THEN
    RETURN jsonb_build_object('code','NOT_FOUND');
  END IF;
  IF target_rental.status NOT IN ('Released','Active') THEN
    RETURN jsonb_build_object('code','RENTAL_INACTIVE');
  END IF;

  SELECT * INTO target_assignment
  FROM erp.assignments AS assignment_record
  WHERE assignment_record.id=target_line.assignment_id
    AND assignment_record.company_id=tenant
    AND assignment_record.deleted_at IS NULL
  FOR SHARE;
  IF target_assignment.id IS NULL OR target_assignment.status<>'Active'
    OR target_assignment.equipment_id<>target_line.equipment_id
    OR target_assignment.operator_id<>target_line.operator_id
  THEN
    RETURN jsonb_build_object('code','ASSIGNMENT_INACTIVE');
  END IF;

  SELECT * INTO target_operator
  FROM erp.operators AS operator_record
  WHERE operator_record.id=target_line.operator_id
    AND operator_record.company_id=tenant
    AND operator_record.deleted_at IS NULL;
  IF target_operator.id IS NULL OR target_operator.status<>'Active' THEN
    RETURN jsonb_build_object('code','OPERATOR_INACTIVE');
  END IF;

  SELECT * INTO target_equipment
  FROM erp.equipment AS equipment_record
  WHERE equipment_record.id=target_line.equipment_id
    AND equipment_record.company_id=tenant
    AND equipment_record.active
    AND equipment_record.deleted_at IS NULL;
  IF target_equipment.id IS NULL THEN
    RETURN jsonb_build_object('code','NOT_FOUND');
  END IF;

  snapshot:=nullif(target_line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF snapshot IS NULL
    OR snapshot->>'rentalId' IS DISTINCT FROM target_rental.id
    OR snapshot->>'rentalEquipmentLineId' IS DISTINCT FROM target_line.id
    OR snapshot->>'assignmentId' IS DISTINCT FROM target_assignment.id
    OR snapshot->>'equipmentId' IS DISTINCT FROM target_equipment.id
    OR snapshot->>'operatorId' IS DISTINCT FROM target_operator.id
    OR snapshot->>'meterRequirement' NOT IN ('none','hourMeter','odometer','both')
  THEN
    RETURN jsonb_build_object('code','DEUR_EXPECTATION_REQUIRED');
  END IF;

  RETURN jsonb_build_object(
    'code','OK','companyId',tenant,'encoderUserId',application_user.id,
    'rentalId',target_rental.id,'rentalLineId',target_line.id,
    'assignmentId',target_assignment.id,'equipmentId',target_equipment.id,
    'operatorId',target_operator.id,'meterRequirement',snapshot->>'meterRequirement'
  );
END $$;
CREATE OR REPLACE FUNCTION erp.command_create_manual_deur(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
DECLARE
  tenant text:=erp.current_company_id();
  actor uuid:=auth.uid();
  now_at timestamptz:=erp.deur_operational_clock();
  scope jsonb;
  target_line erp.rental_equipment_lines%ROWTYPE;
  target_rental erp.rentals%ROWTYPE;
  snapshot jsonb;
  commercial erp.commercial_snapshots%ROWTYPE;
  created_deur erp.deurs%ROWTYPE;
  idem jsonb;
  payload_hash text;
  response jsonb;
  policy text;
  work_day date;
  selected_shift text;
  opening_hour numeric;
  opening_odo numeric;
  manual_reason text;
  manual_notes text;
  physical_reference text;
BEGIN
  IF jsonb_typeof(command)<>'object'
    OR EXISTS(
      SELECT 1
      FROM jsonb_object_keys(command) AS key_name
      WHERE key_name NOT IN (
        'commandId','idempotencyKey','rentalLineId','reason','notes','physicalDeurReference',
        'openingHourMeter','openingOdometer','shift','operationalRemarks','clientCreatedAt','deviceId'
      )
    )
    OR command ?| ARRAY[
      'companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id',
      'createdAt','created_at','createdBy','created_by','updatedAt','updated_at','updatedBy','updated_by',
      'operatorId','operator_id','equipmentId','equipment_id','assignmentId','assignment_id',
      'rentalId','rental_id','projectId','project_id','customerId','customer_id',
      'meterRequirement','meter_requirement','creationSource','creation_source',
      'sourceDocument','source_document','encoderId','encoder_id'
    ]
    OR nullif(btrim(command->>'commandId'),'') IS NULL
    OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  scope:=erp.validate_manual_deur_create_scope(command);
  IF scope->>'code'<>'OK' THEN
    RETURN jsonb_build_object('success',false,'code',scope->>'code');
  END IF;

  manual_reason:=nullif(btrim(command->>'reason'),'');
  manual_notes:=nullif(btrim(command->>'notes'),'');
  physical_reference:=nullif(btrim(command->>'physicalDeurReference'),'');
  IF manual_reason NOT IN (
    'DEVICE_LOST','DEVICE_DAMAGED','APP_UNAVAILABLE','CONNECTIVITY_OR_TECHNICAL_ISSUE',
    'OPERATOR_DEVICE_UNAVAILABLE','OTHER'
  ) OR (manual_reason='OTHER' AND manual_notes IS NULL)
    OR (manual_notes IS NOT NULL AND length(manual_notes)>2000)
    OR (physical_reference IS NOT NULL AND length(physical_reference)>200)
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO target_line
  FROM erp.rental_equipment_lines AS line_record
  WHERE line_record.id=scope->>'rentalLineId' AND line_record.company_id=tenant
  FOR UPDATE;
  SELECT * INTO target_rental
  FROM erp.rentals AS rental_record
  WHERE rental_record.id=target_line.rental_id AND rental_record.company_id=tenant
  FOR SHARE;
  snapshot:=target_line.operational_metadata->'deurExpectationSnapshot';
  policy:=snapshot->>'meterRequirement';
  SELECT * INTO commercial
  FROM erp.commercial_snapshots AS snapshot_record
  WHERE snapshot_record.rental_id=target_rental.id
    AND snapshot_record.rental_equipment_line_id=target_line.id
  ORDER BY snapshot_record.captured_at DESC
  LIMIT 1;
  IF commercial.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED');
  END IF;

  BEGIN
    opening_hour:=nullif(trim(command->>'openingHourMeter'),'')::numeric;
    opening_odo:=nullif(trim(command->>'openingOdometer'),'')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END;
  IF (opening_hour IS NOT NULL AND opening_hour<0)
    OR (opening_odo IS NOT NULL AND opening_odo<0)
    OR ((policy IN ('odometer','both')) AND opening_odo IS NULL)
    OR (policy='odometer' AND opening_hour IS NOT NULL)
    OR (policy='hourMeter' AND opening_odo IS NOT NULL)
    OR (policy='none' AND (opening_hour IS NOT NULL OR opening_odo IS NOT NULL))
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  idem:=erp.begin_deur_command(command,'CREATE_MANUAL_DEUR');
  IF idem->>'state'='MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  END IF;
  IF idem->>'state'='REPLAY' THEN
    RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  END IF;
  payload_hash:=idem->>'payloadHash';

  work_day:=erp.resolve_uat_limited_pilot_work_date(target_line.id,(snapshot->>'workDate')::date);
  selected_shift:=nullif(btrim(command->>'shift'),'');
  IF selected_shift IS NOT NULL AND (length(selected_shift)>80 OR selected_shift~'[[:cntrl:]]') THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  IF EXISTS(
    SELECT 1 FROM erp.deurs AS existing_deur
    WHERE existing_deur.company_id=tenant
      AND existing_deur.rental_equipment_line_id=target_line.id
      AND existing_deur.work_date=work_day
      AND existing_deur.status IN ('Draft','In Progress')
  ) THEN
    RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
  END IF;

  INSERT INTO erp.deurs(
    id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,
    project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,
    work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,opening_hour_meter,
    opening_odometer,operational_metadata,operational_remarks,manual_metadata,
    created_at,created_by,updated_at,updated_by,row_version,company_id
  )
  VALUES(
    extensions.gen_random_uuid()::text,erp.next_deur_number(),target_rental.id,target_line.id,
    snapshot->>'assignmentId',snapshot->>'equipmentId',snapshot->>'operatorId',
    snapshot->>'projectId',snapshot->>'customerId',commercial.id,true,'MANUAL_WEB',
    work_day,selected_shift,'In Progress',
    CASE snapshot->>'billingMethod'
      WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP'
      WHEN 'Per Cubic Meter' THEN 'QUANTITY'
      WHEN 'One Lot' THEN 'COMPLETION'
      WHEN 'Per Lot' THEN 'COMPLETION'
      ELSE 'TIME_TIMELINE'
    END,
    commercial.billing_method,
    CASE policy WHEN 'hourMeter' THEN opening_hour WHEN 'odometer' THEN opening_odo END,
    CASE WHEN policy IN ('hourMeter','both') THEN opening_hour END,
    CASE WHEN policy IN ('odometer','both') THEN opening_odo END,
    (snapshot->'operationalMetadata')||jsonb_build_object('workDescription',snapshot->'workDescription'),
    nullif(btrim(command->>'operationalRemarks'),''),
    jsonb_strip_nulls(jsonb_build_object(
      'sourceDocument','PHYSICAL_DEUR','reason',manual_reason,'notes',manual_notes,
      'physicalDeurReference',physical_reference,'encoderUserId',actor::text,'encodedAt',now_at
    )),
    now_at,actor::text,now_at,actor::text,1,tenant
  )
  RETURNING * INTO created_deur;

  INSERT INTO erp.deur_events(
    id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,
    client_created_at,command_id,idempotency_key,device_id,is_open,company_id
  )
  VALUES
    (extensions.gen_random_uuid()::text,created_deur.id,'shift','start',now_at,1,'manual-web',actor::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',nullif(command->>'deviceId',''),true,tenant),
    (extensions.gen_random_uuid()::text,created_deur.id,'operation','start',now_at,2,'manual-web',actor::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',nullif(command->>'deviceId',''),true,tenant);

  INSERT INTO erp.audit_log(
    id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata
  )
  VALUES(
    extensions.gen_random_uuid()::text,tenant,'DEUR',created_deur.id,'MANUAL_DEUR_CREATED',actor::text,now_at,
    command->>'commandId',
    jsonb_build_object('deurNumber',created_deur.deur_number,'status',created_deur.status,'rowVersion',created_deur.row_version),
    jsonb_build_object(
      'encoderUserId',actor::text,'operatorId',created_deur.operator_id,'rentalId',created_deur.rental_id,
      'rentalEquipmentLineId',created_deur.rental_equipment_line_id,'assignmentId',created_deur.assignment_id,
      'equipmentId',created_deur.equipment_id,'creationSource','MANUAL_WEB','sourceDocument','PHYSICAL_DEUR',
      'reason',manual_reason,'idempotencyKey',command->>'idempotencyKey'
    )
  );

  response:=jsonb_build_object(
    'success',true,'disposition','ACCEPTED',
    'record',to_jsonb(created_deur)||erp.canonical_deur_meter_evidence(
      policy,created_deur.opening_hour_meter,created_deur.closing_hour_meter,
      created_deur.opening_odometer,created_deur.closing_odometer,
      created_deur.opening_meter,created_deur.closing_meter
    ),
    'version',created_deur.row_version,'serverOccurredAt',now_at
  );
  RETURN erp.finish_deur_command(command,'CREATE_MANUAL_DEUR',created_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;
ALTER FUNCTION erp.validate_manual_deur_create_scope(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_create_manual_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.validate_manual_deur_create_scope(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_create_manual_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_manual_deur(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_create_manual_deur(jsonb) IS
  'Creates an in-progress MANUAL_WEB DEUR from a physical DEUR form; office actor is encoder and the assigned operator remains the operational owner.';
COMMIT;
