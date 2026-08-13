BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE TABLE erp.daily_grouped_review_scheduler_groups(
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
 command_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 company_id text NOT NULL REFERENCES erp.companies(id),customer_id text NOT NULL,project_id text NOT NULL,rental_id text NOT NULL,
 business_date date NOT NULL,business_timezone text NOT NULL,run_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DISCOVERED' CHECK(status IN('DISCOVERED','COMPLETED')),
 result_summary jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 UNIQUE(command_id,company_id,rental_id,business_date),
 FOREIGN KEY(company_id,rental_id,customer_id,project_id,business_timezone)
   REFERENCES erp.rentals(company_id,id,customer_id,project_id,timezone)
);
CREATE INDEX ix_daily_grouped_review_scheduler_groups_company_run ON erp.daily_grouped_review_scheduler_groups(company_id,run_at DESC);
ALTER TABLE erp.daily_grouped_review_scheduler_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.daily_grouped_review_scheduler_groups FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.command_run_daily_grouped_customer_reviews(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE run_at timestamptz;command_id uuid;idem text;candidate_rows jsonb;failure_rows jsonb;evaluated integer;no_action integer;inserted integer;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('commandId','idempotencyKey','runAt'))
  OR coalesce(command->>'commandId','')!~'^[0-9a-f-]{36}$' OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR length(command->>'idempotencyKey')>200
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN command_id=(command->>'commandId')::uuid;run_at=(command->>'runAt')::timestamptz;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 idem=btrim(command->>'idempotencyKey');
 IF EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=command_run_daily_grouped_customer_reviews.command_id AND g.idempotency_key<>idem)
 THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');END IF;
 SELECT count(*) INTO evaluated FROM rentals r WHERE r.deleted_at IS NULL;
 WITH eligible AS(
  SELECT r.company_id,r.customer_id,r.project_id,r.id rental_id,r.timezone,(run_at AT TIME ZONE r.timezone)::date business_date
  FROM rentals r WHERE r.deleted_at IS NULL AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone)
   AND NOT EXISTS(SELECT 1 FROM customer_review_batches b WHERE b.company_id=r.company_id AND b.rental_id=r.id AND b.review_date=(run_at AT TIME ZONE r.timezone)::date)
   AND EXISTS(
    SELECT 1 FROM rental_equipment_lines l JOIN deurs d ON d.company_id=l.company_id AND d.rental_equipment_line_id=l.id AND d.superseded_by_revision_id IS NULL
    LEFT JOIN LATERAL(SELECT q.* FROM customer_review_requests q WHERE q.company_id=d.company_id AND q.revision_id=d.id ORDER BY q.created_at DESC LIMIT 1) q ON true
    WHERE l.company_id=r.company_id AND l.rental_id=r.id AND l.deleted_at IS NULL AND d.status='Submitted'
      AND (q.id IS NULL OR (q.status='Pending' AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL AND q.expires_at>run_at))
   )
 ),ins AS(
  INSERT INTO daily_grouped_review_scheduler_groups(command_id,idempotency_key,company_id,customer_id,project_id,rental_id,business_date,business_timezone,run_at)
  SELECT command_id,idem,e.company_id,e.customer_id,e.project_id,e.rental_id,e.business_date,e.timezone,run_at FROM eligible e
  ON CONFLICT(command_id,company_id,rental_id,business_date) DO NOTHING RETURNING *
 ) SELECT count(*) INTO inserted FROM ins;
 SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',g.company_id,'customerId',g.customer_id,'projectId',g.project_id,'rentalId',g.rental_id,'businessDate',g.business_date,'timezone',g.business_timezone) ORDER BY g.company_id,g.rental_id),'[]'::jsonb)
 INTO candidate_rows FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=command_run_daily_grouped_customer_reviews.command_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('rentalId',r.id,'code','INVALID_TIMEZONE') ORDER BY r.company_id,r.id),'[]'::jsonb)
 INTO failure_rows FROM rentals r WHERE r.deleted_at IS NULL AND (nullif(btrim(r.timezone),'') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone));
 no_action=greatest(0,evaluated-jsonb_array_length(candidate_rows)-jsonb_array_length(failure_rows));
 RETURN jsonb_build_object('success',true,'disposition',CASE WHEN inserted=0 THEN 'REPLAYED' ELSE 'CREATED' END,'value',jsonb_build_object(
  'runId',command_id,'disposition',CASE WHEN inserted=0 THEN 'REPLAYED' ELSE 'CREATED' END,'candidates',candidate_rows,'groupsEvaluated',evaluated,'groupsNoActionable',no_action,'failures',failure_rows));
END $$;

CREATE FUNCTION erp.complete_daily_grouped_customer_review_run(run_id uuid,result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(result)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(result) k WHERE k NOT IN('groupsEvaluated','groupsActionable','groupsPrepared','groupsReplayed','groupsNoActionable','groupsFailed','notificationsPrepared','failureCodes'))
  OR result::text~*'credential|reviewPath|ciphertext|nonce|authTag|encryption'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 UPDATE daily_grouped_review_scheduler_groups SET status='COMPLETED',result_summary=result,completed_at=clock_timestamp() WHERE command_id=run_id AND status='DISCOVERED';GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('success',true,'disposition',CASE WHEN affected=0 THEN 'REPLAYED' ELSE 'RECORDED' END,'value',jsonb_build_object('groupsRecorded',affected));
END $$;

DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'(SELECT count(*) FROM operational_command_idempotency WHERE company_id=target_tenant_id)>20','(SELECT count(*) FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>6 OR (SELECT count(*) FROM operational_command_idempotency WHERE company_id=target_tenant_id)>20');
 definition:=replace(definition,'DELETE FROM operational_command_idempotency WHERE company_id=target_tenant_id;','DELETE FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id; DELETE FROM operational_command_idempotency WHERE company_id=target_tenant_id;');
 IF definition NOT LIKE '%daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>6%' OR definition NOT LIKE '%DELETE FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id;%'
 THEN RAISE EXCEPTION '07000 scheduler cleanup extension did not match certified boundary' USING ERRCODE='55000';END IF;EXECUTE definition;
END $$;

ALTER FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_daily_grouped_customer_review_run(uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb),erp.complete_daily_grouped_customer_review_run(uuid,jsonb),erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb),erp.complete_daily_grouped_customer_review_run(uuid,jsonb) TO service_role;
COMMENT ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) IS 'Service-only canonical Rental/date discovery. It returns identifiers and safe failure codes only; authority and encrypted atomic preparation remain separate trusted server steps.';
COMMIT;
