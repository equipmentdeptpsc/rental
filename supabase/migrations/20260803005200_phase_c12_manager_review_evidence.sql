BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE FUNCTION build_manager_review_evidence(target_company_id text,target_rental_id text,target_line_id text,target_deur_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE company_record companies; rental_record rentals; line_record rental_equipment_lines; target deurs;
  equipment_record equipment; operator_record operators; project_record projects; decision record;
  start_at timestamptz; end_at timestamptz; starts integer; ends integer; decisions integer;
BEGIN
  SELECT * INTO company_record FROM companies WHERE id=target_company_id AND active=true;
  SELECT * INTO rental_record FROM rentals WHERE id=target_rental_id AND company_id=target_company_id;
  SELECT * INTO line_record FROM rental_equipment_lines WHERE id=target_line_id AND rental_id=target_rental_id AND company_id=target_company_id;
  SELECT * INTO target FROM deurs WHERE id=target_deur_id AND rental_id=target_rental_id
    AND rental_equipment_line_id=target_line_id AND company_id=target_company_id;
  SELECT * INTO equipment_record FROM equipment WHERE id=line_record.equipment_id AND company_id=target_company_id;
  SELECT * INTO operator_record FROM operators WHERE id=line_record.operator_id AND company_id=target_company_id;
  SELECT * INTO project_record FROM projects WHERE id=rental_record.project_id AND company_id=target_company_id;
  SELECT count(*) FILTER(WHERE activity_type='shift' AND action='start'),
    count(*) FILTER(WHERE activity_type='shift' AND action='end'),
    min(occurred_at) FILTER(WHERE activity_type='shift' AND action='start'),
    min(occurred_at) FILTER(WHERE activity_type='shift' AND action='end')
  INTO starts,ends,start_at,end_at FROM deur_events WHERE company_id=target_company_id AND deur_id=target_deur_id;
  SELECT count(*) INTO decisions FROM customer_review_outcomes outcome JOIN customer_review_requests request
    ON request.id=outcome.review_request_id AND request.company_id=outcome.company_id
  WHERE outcome.company_id=target_company_id AND outcome.rental_id=target_rental_id
    AND request.rental_equipment_line_id=target_line_id AND outcome.deur_id=target_deur_id
    AND outcome.revision_id=target_deur_id AND request.deur_id=target_deur_id
    AND request.revision_id=target_deur_id AND outcome.action='ACKNOWLEDGE' AND request.status='Acknowledged';
  SELECT outcome.action,outcome.occurred_at INTO decision
  FROM customer_review_outcomes outcome JOIN customer_review_requests request
    ON request.id=outcome.review_request_id AND request.company_id=outcome.company_id
  WHERE outcome.company_id=target_company_id AND outcome.rental_id=target_rental_id
    AND request.rental_equipment_line_id=target_line_id AND outcome.deur_id=target_deur_id
    AND outcome.revision_id=target_deur_id AND request.deur_id=target_deur_id
    AND request.revision_id=target_deur_id AND outcome.action='ACKNOWLEDGE' AND request.status='Acknowledged' LIMIT 1;
  IF company_record.id IS NULL OR rental_record.id IS NULL OR line_record.id IS NULL OR target.id IS NULL
    OR equipment_record.id IS NULL OR operator_record.id IS NULL OR nullif(btrim(rental_record.customer_snapshot),'') IS NULL
    OR target.equipment_id IS DISTINCT FROM line_record.equipment_id OR target.operator_id IS DISTINCT FROM line_record.operator_id
    OR target.status<>'Acknowledged' OR target.superseded_by_revision_id IS NOT NULL
    OR starts<>1 OR ends<>1 OR start_at IS NULL OR end_at IS NULL OR end_at<start_at
    OR decisions<>1 OR decision.action IS DISTINCT FROM 'ACKNOWLEDGE'
  THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('companyName',company_record.name,'customerName',rental_record.customer_snapshot,
    'rentalReference',rental_record.rental_number,'project',coalesce(project_record.name,rental_record.project_snapshot),
    'equipment',equipment_record.equipment_name,'assetNumber',equipment_record.asset_no,'operator',operator_record.name,
    'workDate',target.work_date,'shift',target.shift,'shiftStart',start_at,'shiftEnd',end_at,
    'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
    'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,
    'standbyMinutes',target.total_standby_minutes,'breakdownMinutes',target.total_maintenance_minutes,
    'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'customerDecision',jsonb_build_object('action',decision.action,'occurredAt',decision.occurred_at),
    'billingEligible',NOT target.billing_locked);
END $$;

CREATE FUNCTION enforce_manager_review_evidence_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE evidence jsonb;
BEGIN
  evidence=build_manager_review_evidence(NEW.company_id,NEW.rental_id,NEW.rental_equipment_line_id,NEW.revision_id);
  IF evidence IS NULL OR NEW.deur_id IS DISTINCT FROM NEW.revision_id THEN
    RAISE EXCEPTION 'canonical manager review evidence is incomplete' USING ERRCODE='55000';
  END IF;
  NEW.snapshot=evidence||jsonb_build_object('correctionHistory',coalesce(NEW.snapshot->'correctionHistory','[]'::jsonb),
    'reviewHistory',coalesce(NEW.snapshot->'reviewHistory','[]'::jsonb));
  RETURN NEW;
END $$;
CREATE TRIGGER manager_review_evidence_snapshot BEFORE INSERT ON manager_review_requests
FOR EACH ROW EXECUTE FUNCTION enforce_manager_review_evidence_snapshot();

CREATE OR REPLACE FUNCTION manager_review_deur_is_current(request manager_review_requests,target deurs)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
 SELECT target.id IS NOT NULL AND target.id=request.deur_id
   AND target.row_version=request.revision_version+1 AND target.status='Acknowledged'
   AND target.superseded_by_revision_id IS NULL AND target.manager_review_status='Pending'
$$;

-- Applied-history functions used Submitted as their lifecycle state. Replace that exact
-- predicate in all three definitions while preserving every other command/security rule.
DO $$
DECLARE definition text; function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['command_create_manager_review_request','get_manager_review','decide_manager_review'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='erp' AND p.proname=function_name ORDER BY p.oid LIMIT 1;
    IF definition IS NULL THEN RAISE EXCEPTION 'required manager function missing: %',function_name; END IF;
    IF function_name='command_create_manager_review_request' THEN
      IF position('target.status<>''Submitted''' in definition)=0 THEN RAISE EXCEPTION 'unexpected manager issuance definition'; END IF;
      definition=replace(definition,'target.status<>''Submitted''','target.status<>''Acknowledged''');
    ELSE
      IF position('target.status<>''Submitted''' in definition)=0 THEN RAISE EXCEPTION 'unexpected manager review definition: %',function_name; END IF;
      definition=replace(definition,'target.status<>''Submitted''','target.status<>''Acknowledged''');
    END IF;
    EXECUTE definition;
  END LOOP;
END $$;

ALTER FUNCTION build_manager_review_evidence(text,text,text,text) OWNER TO postgres;
ALTER FUNCTION enforce_manager_review_evidence_snapshot() OWNER TO postgres;
ALTER FUNCTION manager_review_deur_is_current(manager_review_requests,deurs) OWNER TO postgres;
REVOKE ALL ON FUNCTION build_manager_review_evidence(text,text,text,text),enforce_manager_review_evidence_snapshot(),
  manager_review_deur_is_current(manager_review_requests,deurs) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION command_create_manager_review_request(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_create_manager_review_request(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION get_manager_review(jsonb) FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_manager_review(jsonb) TO anon;
REVOKE ALL ON FUNCTION decide_manager_review(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
