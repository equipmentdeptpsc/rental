BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The pilot clock is server-owned.  This authenticated reader exposes only the
-- active operator's own fixed-pilot line and its effective work date; it is not
-- a general DEUR lookup and contains no mutation capability.
CREATE OR REPLACE FUNCTION erp.read_uat_limited_pilot_operator_work_date(line_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id();
  actor erp.users%ROWTYPE;
  scenario_row erp.uat_limited_operational_pilot_scenarios%ROWTYPE;
  effective_date date;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');
  END IF;

  SELECT * INTO actor
  FROM erp.users AS user_record
  WHERE user_record.id=auth.uid()
    AND user_record.company_id=tenant
    AND user_record.status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED');
  END IF;

  SELECT * INTO scenario_row
  FROM erp.uat_limited_operational_pilot_scenarios AS scenario_record
  WHERE scenario_record.company_id='TENANT-LOCAL-001'
    AND scenario_record.scenario_key='LIMITED-OPERATIONAL-PILOT-2026-09'
    AND scenario_record.profile_version='UAT_LIMITED_PILOT_V1'
    AND scenario_record.state='DOMAIN_READY'
    AND line_id IN (
      scenario_record.scenario->>'line1Id',
      scenario_record.scenario->>'line2Id',
      scenario_record.scenario->>'line3Id'
    );
  IF scenario_row.scenario_key IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_PILOT_WORK');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM erp.rental_equipment_lines AS line_record
    JOIN erp.assignments AS assignment_record
      ON assignment_record.id=line_record.assignment_id
      AND assignment_record.company_id=tenant
      AND assignment_record.status='Active'
    WHERE line_record.id=line_id
      AND line_record.company_id=tenant
      AND line_record.operator_id=actor.operator_id
      AND line_record.status IN ('Released','Active')
      AND line_record.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH');
  END IF;

  SELECT clock_record.effective_business_date INTO effective_date
  FROM erp.uat_limited_pilot_business_clock AS clock_record
  WHERE clock_record.company_id=tenant
    AND clock_record.scenario_key='LIMITED-OPERATIONAL-PILOT-2026-09'
    AND clock_record.profile_version='UAT_LIMITED_PILOT_V1';
  IF effective_date IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','CLOCK_NOT_INITIALIZED');
  END IF;

  RETURN jsonb_build_object(
    'success',true,
    'rentalEquipmentLineId',line_id,
    'effectiveWorkDate',effective_date
  );
END $$;

ALTER FUNCTION erp.read_uat_limited_pilot_operator_work_date(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_uat_limited_pilot_operator_work_date(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_uat_limited_pilot_operator_work_date(text) TO authenticated;

COMMIT;
