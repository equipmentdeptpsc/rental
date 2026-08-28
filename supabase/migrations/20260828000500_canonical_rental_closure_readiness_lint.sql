-- Forward-only qualification repair for the applied closure-readiness function.
-- Domain behavior is unchanged; target_rental_id removes PL/pgSQL column ambiguity.
CREATE OR REPLACE FUNCTION erp.get_rental_closure_readiness(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=erp.current_company_id(); target_rental_id text=command->>'rentalId'; blockers jsonb;
BEGIN
  IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM erp.rentals r WHERE r.id=target_rental_id AND r.company_id=tenant) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',b.code,'message',b.message,'rentalLineId',b.line_id)),'[]'::jsonb) INTO blockers
  FROM (
    SELECT 'LINE_NOT_RETURNED' code,'Equipment line is not returned.' message,l.id line_id FROM erp.rental_equipment_lines l WHERE l.rental_id=target_rental_id AND l.company_id=tenant AND l.status NOT IN('Returned','Closed','Cancelled')
    UNION ALL SELECT 'DEUR_INCOMPLETE','Daily operations are not finalized.',d.rental_equipment_line_id FROM erp.deurs d WHERE d.rental_id=target_rental_id AND d.company_id=tenant AND d.status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected')
    UNION ALL SELECT 'ASSIGNMENT_ACTIVE','Equipment assignment is still active.',l.id FROM erp.rental_equipment_lines l JOIN erp.assignments a ON a.id=l.assignment_id AND a.company_id=l.company_id WHERE l.rental_id=target_rental_id AND l.company_id=tenant AND a.status='Active'
  ) b;
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'refresh','[]'::jsonb,
    'value',jsonb_build_object('rentalId',target_rental_id,'ready',jsonb_array_length(blockers)=0,'lines','[]'::jsonb,'blockers',blockers));
END $$;
