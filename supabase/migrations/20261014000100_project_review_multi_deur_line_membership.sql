BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- A Rental line may have more than one terminal original DEUR on a business
-- date. Iterate those revisions rather than treating the line as ambiguous.
-- Preserve the single placeholder item when no DEUR exists for the date.
DO $migration$
DECLARE definition text;
  old_selection text := $old$
    SELECT count(*) INTO candidate_count FROM erp.deurs WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL AND (work_date=requested_date OR (previous_revision_id IS NOT NULL AND submitted_at IS NOT NULL AND (submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date));
    IF candidate_count>1 THEN RAISE EXCEPTION 'ambiguous effective DEUR for Rental line' USING ERRCODE='55000'; END IF;
    SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL AND (work_date=requested_date OR (previous_revision_id IS NOT NULL AND submitted_at IS NOT NULL AND (submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date));
    request=NULL;$old$;
  new_selection text := $new$
    FOR candidate_target_id IN
      SELECT candidate.id FROM (SELECT 1) seed LEFT JOIN LATERAL (
        SELECT d.id,d.submitted_at,d.created_at FROM erp.deurs d
        WHERE d.company_id=tenant AND d.rental_equipment_line_id=line_record.id
          AND d.superseded_by_revision_id IS NULL
          AND (d.work_date=requested_date OR (d.previous_revision_id IS NOT NULL
            AND d.submitted_at IS NOT NULL
            AND (d.submitted_at AT TIME ZONE member_rental.timezone)::date=requested_date))
        ORDER BY d.submitted_at NULLS LAST,d.created_at,d.id
      ) candidate ON true
    LOOP
      SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND id=candidate_target_id;
      request=NULL;$new$;
  old_end text := $old$
    total_count=total_count+1;
  END LOOP;

  UPDATE erp.customer_review_batches$old$;
  new_end text := $new$
    total_count=total_count+1;
    END LOOP;
  END LOOP;

  UPDATE erp.customer_review_batches$new$;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure)
    INTO definition;
  IF (length(definition)-length(replace(definition,old_selection,'')))/length(old_selection)<>1
    OR (length(definition)-length(replace(definition,old_end,'')))/length(old_end)<>1
    OR position('member_rental erp.rentals' IN definition)=0
  THEN RAISE EXCEPTION 'Project review generator selection contract changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,'line_record erp.rental_equipment_lines; target erp.deurs;',
    'line_record erp.rental_equipment_lines; candidate_target_id text; target erp.deurs;');
  definition:=replace(definition,old_selection,new_selection);
  definition:=replace(definition,old_end,new_end);
  EXECUTE definition;
END $migration$;

-- The later consolidated Start Shift definition accidentally restored the
-- frozen Rental snapshot's first work date. The server-owned local date was
-- already established by 20260915000100; keep the explicit return-day path.
DO $work_date$
DECLARE definition text;
  old_date text := 'effective_date:=erp.resolve_uat_limited_pilot_work_date(line.id,(snap->>''workDate'')::date);';
  new_date text := 'effective_date:=erp.resolve_uat_limited_pilot_work_date(line.id,timezone(coalesce(nullif(snap#>>''{policy,timezone}'',''''),''UTC''),now_at)::date);';
BEGIN
  SELECT pg_get_functiondef('erp.command_start_deur_shift(jsonb)'::regprocedure)
    INTO definition;
  IF (length(definition)-length(replace(definition,old_date,'')))/length(old_date)<>1
    OR position('IF scope->>''historicalReturnDay''=''true'' THEN' IN definition)=0
  THEN RAISE EXCEPTION 'Start Shift business-date contract changed' USING ERRCODE='55000'; END IF;
  EXECUTE replace(definition,old_date,new_date);
END $work_date$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated;
COMMIT;
