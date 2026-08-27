BEGIN;
SET search_path TO erp, auth, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION erp.get_rental_return_readiness(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); target erp.rentals; today_local date; blockers jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.return') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental return is not authorized.','retryable',false,'refreshRequired',false);
  END IF;
  IF command ? 'companyId' OR nullif(command->>'rentalId','') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Rental is required.','retryable',false,'refreshRequired',false);
  END IF;
  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental was not found.','retryable',false,'refreshRequired',false); END IF;
  today_local=(timezone(coalesce(nullif(target.timezone,''),'Asia/Manila'),clock_timestamp()))::date;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code','DEUR_EXPECTATION_UNRESOLVED','rentalLineId',required.rental_line_id,
    'workDate',required.work_date,'shiftCode',required.shift_code,
    'message','Required historical DEUR expectation is unresolved.'
  ) ORDER BY required.work_date,required.rental_line_id,required.shift_code),'[]'::jsonb)
  INTO blockers
  FROM (
    SELECT line.id rental_line_id,day::date work_date,shift.code shift_code,
      line.operational_metadata#>>'{deurExpectationSnapshot,sourceFingerprint}' fingerprint
    FROM erp.rental_equipment_lines line
    CROSS JOIN LATERAL generate_series(
      greatest((line.operational_metadata#>>'{deurExpectationSnapshot,policy,effectiveFrom}')::date,(timezone(coalesce(nullif(line.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}',''),'Asia/Manila'),target.released_at))::date),
      least(coalesce(nullif(line.operational_metadata#>>'{deurExpectationSnapshot,policy,effectiveUntil}','')::date,today_local-1),today_local-1),
      interval '1 day') day
    CROSS JOIN LATERAL (
      SELECT NULL::text code WHERE line.operational_metadata#>>'{deurExpectationSnapshot,policy,frequency}'='PER_WORKDAY'
      UNION ALL
      SELECT value#>>'{}' FROM jsonb_array_elements(coalesce(line.operational_metadata#>'{deurExpectationSnapshot,policy,expectedShiftCodes}','[]'::jsonb)) value
      WHERE line.operational_metadata#>>'{deurExpectationSnapshot,policy,frequency}'='PER_SHIFT'
    ) shift
    WHERE line.company_id=tenant AND line.rental_id=target.id
      AND line.status IN('Released','Active')
      AND NOT coalesce(line.operational_metadata#>'{deurExpectationSnapshot,policy,excludeDates}','[]'::jsonb) ? day::date::text
  ) required
  WHERE NOT EXISTS (
    SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_id=target.id
      AND d.rental_equipment_line_id=required.rental_line_id AND d.work_date=required.work_date
      AND d.superseded_by_revision_id IS NULL AND d.status IN('Acknowledged','Billed')
      AND (required.shift_code IS NULL OR upper(d.shift::text)=upper(required.shift_code))
  ) AND NOT EXISTS (
    SELECT 1 FROM erp.deur_expectation_dispositions disposition
    WHERE disposition.company_id=tenant AND disposition.rental_id=target.id
      AND disposition.rental_equipment_line_id=required.rental_line_id
      AND disposition.work_date=required.work_date AND disposition.expectation_fingerprint=required.fingerprint
      AND disposition.disposition='WAIVED'
  );

  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'refresh','[]'::jsonb,
    'value',jsonb_build_object('rentalId',target.id,'ready',jsonb_array_length(blockers)=0,'historicalBoundary',today_local-1,'blockers',blockers));
END $$;

CREATE OR REPLACE FUNCTION erp.command_return_all_rental_lines(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); target erp.rentals; line erp.rental_equipment_lines; outcomes jsonb='[]'::jsonb; result jsonb; readiness jsonb; idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental return is not authorized.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental was not found.','retryable',false,'refreshRequired',false); END IF;
  PERFORM 1 FROM erp.rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant FOR UPDATE;
  idem=erp.begin_operational_command(command,'RETURN_ALL_RENTAL_LINES','RENTAL',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Return command is invalid.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF target.row_version<>coalesce((command->>'expectedVersion')::bigint,target.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Rental version is stale.','retryable',false,'refreshRequired',true,'currentVersion',target.row_version); END IF;
  IF target.status<>'Active' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Only an Active Rental can be returned.','retryable',false,'refreshRequired',false); END IF;
  readiness=erp.get_rental_return_readiness(jsonb_build_object('rentalId',target.id));
  IF readiness->'value'->>'ready'<>'true' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Required historical DEUR expectations must be acknowledged or waived before Return.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM erp.deurs WHERE rental_id=target.id AND company_id=tenant AND status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected')) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Open DEUR work must be completed before Return.','retryable',false,'refreshRequired',false); END IF;
  FOR line IN SELECT * FROM erp.rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant LOOP
    IF line.status NOT IN('Returned','Closed','Cancelled') THEN
      SELECT erp.command_return_rental_line(command||jsonb_build_object('commandId',(command->>'commandId')||':'||line.id,'idempotencyKey',(command->>'idempotencyKey')||':line:'||line.id,'rentalLineId',line.id,'equipmentId',line.equipment_id,'assignmentId',line.assignment_id,'expectedVersion',line.row_version)) INTO result;
      IF NOT coalesce((result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Atomic return blocked'; END IF;
    END IF;
    outcomes=outcomes||jsonb_build_array(jsonb_build_object('rentalId',line.rental_id,'rentalLineId',line.id,'status','Returned','version',line.row_version+1));
  END LOOP;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'refresh',jsonb_build_array(target.id),'value',jsonb_build_object('rentalId',target.id,'lines',outcomes,'version',target.row_version+1));
  RETURN erp.finish_operational_command(command,'RETURN_ALL_RENTAL_LINES','RENTAL',target.id,tenant,auth.uid()::text,payload_hash,response,target.row_version+1);
END $$;

ALTER FUNCTION erp.get_rental_return_readiness(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_return_all_rental_lines(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.get_rental_return_readiness(jsonb),erp.command_return_all_rental_lines(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.get_rental_return_readiness(jsonb),erp.command_return_all_rental_lines(jsonb) TO authenticated;
COMMIT;
