-- Remove positional composite coupling from the correction revision insert.
DO $$
DECLARE
  definition text;
  function_oid oid;
  old_insert text := 'INSERT INTO erp.deurs SELECT revision.*;';
  new_insert text := $sql$
  INSERT INTO erp.deurs (
    id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,
    commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,report_date,shift,status,evidence_mode,billing_method_snapshot,
    total_operating_minutes,total_idle_minutes,total_maintenance_minutes,total_meal_break_minutes,total_mobilization_minutes,total_demobilization_minutes,total_standby_minutes,
    opening_meter,closing_meter,submitted_at,submitted_by,acknowledged_at,acknowledged_by,acknowledged_by_user_id,acknowledgement_remarks,
    rejected_at,rejected_by,rejected_by_user_id,rejection_reason,billing_locked,billing_statement_id,bill_id,legacy,operational_metadata,operational_remarks,
    manual_metadata,odometer_trip_evidence,quantity_evidence,completion_evidence,revision_chain_id,revision_number,original_deur_id,previous_revision_id,
    supersedes_revision_id,superseded_by_revision_id,correction_reason_code,correction_reason_details,corrected_by_name,corrected_by_user_id,corrected_at,
    superseded_at,superseded_by_name,created_at,created_by,updated_at,updated_by,row_version,company_id
  )
  SELECT
    revision.id,revision.deur_number,revision.rental_id,revision.rental_equipment_line_id,revision.assignment_id,revision.equipment_id,revision.operator_id,revision.project_id,revision.customer_id,
    revision.commercial_snapshot_id,revision.commercial_snapshot_required,revision.creation_source,revision.work_date,revision.report_date,revision.shift,revision.status,revision.evidence_mode,revision.billing_method_snapshot,
    revision.total_operating_minutes,revision.total_idle_minutes,revision.total_maintenance_minutes,revision.total_meal_break_minutes,revision.total_mobilization_minutes,revision.total_demobilization_minutes,revision.total_standby_minutes,
    revision.opening_meter,revision.closing_meter,revision.submitted_at,revision.submitted_by,revision.acknowledged_at,revision.acknowledged_by,revision.acknowledged_by_user_id,revision.acknowledgement_remarks,
    revision.rejected_at,revision.rejected_by,revision.rejected_by_user_id,revision.rejection_reason,revision.billing_locked,revision.billing_statement_id,revision.bill_id,revision.legacy,revision.operational_metadata,revision.operational_remarks,
    revision.manual_metadata,revision.odometer_trip_evidence,revision.quantity_evidence,revision.completion_evidence,revision.revision_chain_id,revision.revision_number,revision.original_deur_id,revision.previous_revision_id,
    revision.supersedes_revision_id,revision.superseded_by_revision_id,revision.correction_reason_code,revision.correction_reason_details,revision.corrected_by_name,revision.corrected_by_user_id,revision.corrected_at,
    revision.superseded_at,revision.superseded_by_name,revision.created_at,revision.created_by,revision.updated_at,revision.updated_by,revision.row_version,tenant;
  $sql$;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='command_create_deur_correction'
    AND pg_get_function_identity_arguments(p.oid)='command jsonb';
  IF function_oid IS NULL THEN RAISE EXCEPTION 'erp.command_create_deur_correction(jsonb) is missing'; END IF;
  IF position(old_insert in definition)=0 THEN RAISE EXCEPTION 'positional correction insert marker missing'; END IF;
  definition:=replace(definition,old_insert,new_insert);
  EXECUTE definition;
END;
$$;
