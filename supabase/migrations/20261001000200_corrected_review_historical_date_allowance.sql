BEGIN;
SET search_path=erp,auth,pg_catalog;
-- A corrected revision may be re-reviewed on its own local resubmission date,
-- even after that date has fallen outside the ordinary today/tomorrow window.
-- The exception is derived from the current revision itself; it is not a
-- generic historical-date bypass.
DO $$
DECLARE
  definition text;
  declaration_marker text := 'requested_date date; local_today date;';
  guard_marker text := 'IF (coalesce(current_setting(''erp.scheduler_preparation'',true),'''')<>''true'' AND (requested_date<local_today OR requested_date>local_today+1)) OR (current_setting(''erp.scheduler_preparation'',true)=''true'' AND requested_date>local_today+1) THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_BUSINESS_DATE''); END IF;';
  declaration_replacement text := 'requested_date date; local_today date; historical_corrected_allowed boolean := false;';
  guard_replacement text := $replacement$
  IF requested_date<local_today AND NOT erp.current_user_has_permission('deur.customerReview.issue') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF requested_date<local_today AND erp.current_user_has_permission('deur.customerReview.issue') THEN
    SELECT EXISTS(
      SELECT 1
      FROM erp.customer_review_batches existing_batch
      WHERE existing_batch.company_id=tenant
        AND existing_batch.rental_id=rental_record.id
        AND existing_batch.review_date=requested_date
        AND existing_batch.superseded_at IS NULL
        AND existing_batch.retired_no_actionable_at IS NULL
    ) OR EXISTS(
      SELECT 1
      FROM erp.rental_equipment_lines candidate_line
      JOIN erp.deurs corrected ON corrected.rental_equipment_line_id=candidate_line.id
        AND corrected.company_id=tenant
      WHERE candidate_line.company_id=tenant
        AND candidate_line.rental_id=rental_record.id
        AND candidate_line.deleted_at IS NULL
        AND corrected.superseded_by_revision_id IS NULL
        AND corrected.previous_revision_id IS NOT NULL
        AND corrected.revision_number=2
        AND corrected.status='Submitted'
        AND corrected.submitted_at IS NOT NULL
        AND (corrected.submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date
        AND NOT EXISTS(
          SELECT 1
          FROM erp.customer_review_requests active_request
          WHERE active_request.company_id=tenant
            AND active_request.revision_id=corrected.id
            AND active_request.status='Pending'
            AND active_request.superseded_at IS NULL
            AND active_request.revoked_at IS NULL
            AND active_request.consumed_at IS NULL
            AND active_request.expires_at>now_at
        )
    ) INTO historical_corrected_allowed;
  END IF;
  IF (requested_date<local_today AND NOT historical_corrected_allowed) OR requested_date>local_today+1 THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_BUSINESS_DATE');
  END IF;$replacement$;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,declaration_marker,'')))/length(declaration_marker)<>1
    OR (length(definition)-length(replace(definition,guard_marker,'')))/length(guard_marker)<>1
  THEN
    RAISE EXCEPTION 'corrected-review historical-date allowance did not match the current generator definition' USING ERRCODE='55000';
  END IF;
  definition:=replace(definition,declaration_marker,declaration_replacement);
  definition:=replace(definition,guard_marker,guard_replacement);
  IF definition NOT LIKE '%historical_corrected_allowed%'
    OR definition NOT LIKE '%current_user_has_permission(''deur.customerReview.issue'')%'
    OR definition NOT LIKE '%corrected.submitted_at AT TIME ZONE rental_record.timezone%'
    OR definition NOT LIKE '%corrected.previous_revision_id IS NOT NULL%'
    OR definition NOT LIKE '%corrected.superseded_by_revision_id IS NULL%'
  THEN
    RAISE EXCEPTION 'corrected-review historical-date allowance verification failed' USING ERRCODE='55000';
  END IF;
  EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_generate_customer_review_batch(jsonb) IS 'Authenticated tenant-derived grouped generation. Historical dates are allowed only for a current submitted corrected revision on its canonical local resubmission date; ordinary reviews remain bounded to the current business-date window.';
COMMIT;
