BEGIN;
SET search_path=erp,auth,pg_catalog;

ALTER TABLE erp.daily_grouped_review_scheduler_groups DROP CONSTRAINT daily_grouped_review_scheduler_groups_status_check;
ALTER TABLE erp.daily_grouped_review_scheduler_groups ADD CONSTRAINT daily_grouped_review_scheduler_groups_status_check CHECK(status IN('CLAIMED','COMPLETED','FAILED'));
UPDATE erp.daily_grouped_review_scheduler_groups SET status='COMPLETED' WHERE status='DISCOVERED';
ALTER TABLE erp.daily_grouped_review_scheduler_groups ADD COLUMN claimed_at timestamptz;
ALTER TABLE erp.daily_grouped_review_scheduler_groups ADD COLUMN claim_expires_at timestamptz;
ALTER TABLE erp.daily_grouped_review_scheduler_groups ADD COLUMN attempt_count integer NOT NULL DEFAULT 1 CHECK(attempt_count BETWEEN 1 AND 1000);
ALTER TABLE erp.daily_grouped_review_scheduler_groups ADD COLUMN outcome_code text CHECK(outcome_code IS NULL OR outcome_code IN('PREPARED','REPLAYED','FAILED'));
CREATE UNIQUE INDEX uq_daily_grouped_review_scheduler_group_business_date ON erp.daily_grouped_review_scheduler_groups(company_id,rental_id,business_date);
CREATE INDEX ix_daily_grouped_review_scheduler_claimable ON erp.daily_grouped_review_scheduler_groups(status,claim_expires_at,company_id,rental_id);

CREATE OR REPLACE FUNCTION erp.command_run_daily_grouped_customer_reviews(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE v_run_at timestamptz;v_command_id uuid;idem text;batch_limit integer;candidate_rows jsonb;failure_rows jsonb;claimed integer;has_more boolean;inserted integer;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('commandId','idempotencyKey','runAt','batchLimit'))
  OR coalesce(command->>'commandId','')!~'^[0-9a-f-]{36}$' OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR length(command->>'idempotencyKey')>200
  OR coalesce(command->>'batchLimit','')!~'^[0-9]+$'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN v_command_id=(command->>'commandId')::uuid;v_run_at=(command->>'runAt')::timestamptz;batch_limit=(command->>'batchLimit')::integer;
 EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF batch_limit NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('success',false,'code','BATCH_LIMIT_REJECTED');END IF;
 idem=btrim(command->>'idempotencyKey');
 PERFORM pg_advisory_xact_lock(hashtextextended('erp.daily_grouped_review_scheduler_claim',0));
 IF EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=v_command_id AND g.idempotency_key<>idem)
 THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');END IF;
 IF NOT EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=v_command_id) THEN
  WITH eligible_base AS(
   SELECT r.company_id,r.customer_id,r.project_id,r.id rental_id,r.timezone,(v_run_at AT TIME ZONE r.timezone)::date business_date,c.local_send_time,
    row_number() OVER(PARTITION BY r.company_id ORDER BY (v_run_at AT TIME ZONE r.timezone)::date,r.id) tenant_rank
   FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled
   WHERE r.status IN('Released','Active') AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone)
    AND (v_run_at AT TIME ZONE r.timezone)::time>=c.local_send_time AND (v_run_at AT TIME ZONE r.timezone)::time<c.local_send_time+make_interval(mins=>c.grace_minutes)
    AND EXISTS(SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id WHERE s.company_id=r.company_id AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule')
    AND NOT EXISTS(SELECT 1 FROM customer_review_batches b WHERE b.company_id=r.company_id AND b.rental_id=r.id AND b.review_date=(v_run_at AT TIME ZONE r.timezone)::date)
    AND EXISTS(SELECT 1 FROM rental_equipment_lines l JOIN deurs d ON d.company_id=l.company_id AND d.rental_equipment_line_id=l.id AND d.superseded_by_revision_id IS NULL
     LEFT JOIN LATERAL(SELECT q.* FROM customer_review_requests q WHERE q.company_id=d.company_id AND q.revision_id=d.id ORDER BY q.created_at DESC LIMIT 1) q ON true
     WHERE l.company_id=r.company_id AND l.rental_id=r.id AND l.deleted_at IS NULL AND d.status='Submitted'
      AND(q.id IS NULL OR(q.status='Pending' AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL AND q.expires_at>v_run_at)))
  ),ordered AS(SELECT * FROM eligible_base ORDER BY tenant_rank,business_date,local_send_time,company_id,rental_id),
  reclaimed AS(
   UPDATE daily_grouped_review_scheduler_groups g SET command_id=v_command_id,idempotency_key=idem,run_at=v_run_at,status='CLAIMED',claimed_at=clock_timestamp(),claim_expires_at=clock_timestamp()+interval '10 minutes',attempt_count=g.attempt_count+1,outcome_code=NULL,result_summary=NULL,completed_at=NULL
   FROM(SELECT g2.id FROM daily_grouped_review_scheduler_groups g2 JOIN ordered e ON e.company_id=g2.company_id AND e.rental_id=g2.rental_id AND e.business_date=g2.business_date
    WHERE g2.status='FAILED' OR(g2.status='CLAIMED' AND g2.claim_expires_at<=clock_timestamp()) ORDER BY e.tenant_rank,e.business_date,e.local_send_time,e.company_id,e.rental_id LIMIT batch_limit FOR UPDATE OF g2 SKIP LOCKED) pick
   WHERE g.id=pick.id RETURNING g.id
  ) SELECT count(*) INTO claimed FROM reclaimed;
  WITH eligible_base AS(
   SELECT r.company_id,r.customer_id,r.project_id,r.id rental_id,r.timezone,(v_run_at AT TIME ZONE r.timezone)::date business_date,c.local_send_time,
    row_number() OVER(PARTITION BY r.company_id ORDER BY (v_run_at AT TIME ZONE r.timezone)::date,r.id) tenant_rank
   FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled
   WHERE r.status IN('Released','Active') AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone)
    AND (v_run_at AT TIME ZONE r.timezone)::time>=c.local_send_time AND (v_run_at AT TIME ZONE r.timezone)::time<c.local_send_time+make_interval(mins=>c.grace_minutes)
    AND EXISTS(SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id WHERE s.company_id=r.company_id AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule')
    AND NOT EXISTS(SELECT 1 FROM customer_review_batches b WHERE b.company_id=r.company_id AND b.rental_id=r.id AND b.review_date=(v_run_at AT TIME ZONE r.timezone)::date)
    AND EXISTS(SELECT 1 FROM rental_equipment_lines l JOIN deurs d ON d.company_id=l.company_id AND d.rental_equipment_line_id=l.id AND d.superseded_by_revision_id IS NULL
     LEFT JOIN LATERAL(SELECT q.* FROM customer_review_requests q WHERE q.company_id=d.company_id AND q.revision_id=d.id ORDER BY q.created_at DESC LIMIT 1) q ON true
     WHERE l.company_id=r.company_id AND l.rental_id=r.id AND l.deleted_at IS NULL AND d.status='Submitted'
      AND(q.id IS NULL OR(q.status='Pending' AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL AND q.expires_at>v_run_at)))
  ),fresh AS(SELECT e.* FROM eligible_base e WHERE NOT EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.company_id=e.company_id AND g.rental_id=e.rental_id AND g.business_date=e.business_date) ORDER BY tenant_rank,business_date,local_send_time,company_id,rental_id LIMIT greatest(0,batch_limit-claimed)),ins AS(
   INSERT INTO daily_grouped_review_scheduler_groups(command_id,idempotency_key,company_id,customer_id,project_id,rental_id,business_date,business_timezone,run_at,status,claimed_at,claim_expires_at)
   SELECT v_command_id,idem,e.company_id,e.customer_id,e.project_id,e.rental_id,e.business_date,e.timezone,v_run_at,'CLAIMED',clock_timestamp(),clock_timestamp()+interval '10 minutes' FROM fresh e ON CONFLICT(company_id,rental_id,business_date) DO NOTHING RETURNING id
  ) SELECT count(*) INTO inserted FROM ins;claimed=claimed+inserted;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('groupId',g.id,'companyId',g.company_id,'customerId',g.customer_id,'projectId',g.project_id,'rentalId',g.rental_id,'businessDate',g.business_date,'timezone',g.business_timezone) ORDER BY g.company_id,g.rental_id),'[]'::jsonb)
 INTO candidate_rows FROM(SELECT * FROM daily_grouped_review_scheduler_groups WHERE command_id=v_command_id AND idempotency_key=idem ORDER BY company_id,rental_id LIMIT batch_limit)g;
 SELECT coalesce(jsonb_agg(DISTINCT failure),'[]'::jsonb) INTO failure_rows FROM(
  SELECT jsonb_build_object('code','INVALID_TIMEZONE') failure FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled WHERE r.status IN('Released','Active') AND(nullif(btrim(r.timezone),'') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone))
  UNION ALL SELECT jsonb_build_object('code','SCHEDULER_NOT_READY') FROM grouped_review_scheduler_configurations c WHERE c.automation_enabled AND NOT EXISTS(SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id WHERE s.company_id=c.company_id AND s.active AND p.permission_code='grouped_review.schedule')) failures;
 SELECT EXISTS(SELECT 1 FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled WHERE r.status IN('Released','Active') AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone)
  AND (v_run_at AT TIME ZONE r.timezone)::time>=c.local_send_time AND (v_run_at AT TIME ZONE r.timezone)::time<c.local_send_time+make_interval(mins=>c.grace_minutes)
  AND EXISTS(SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id WHERE s.company_id=r.company_id AND s.active AND p.permission_code='grouped_review.schedule')
  AND NOT EXISTS(SELECT 1 FROM customer_review_batches b WHERE b.company_id=r.company_id AND b.rental_id=r.id AND b.review_date=(v_run_at AT TIME ZONE r.timezone)::date)
  AND EXISTS(SELECT 1 FROM rental_equipment_lines l JOIN deurs d ON d.company_id=l.company_id AND d.rental_equipment_line_id=l.id AND d.superseded_by_revision_id IS NULL WHERE l.company_id=r.company_id AND l.rental_id=r.id AND l.deleted_at IS NULL AND d.status='Submitted')
  AND(NOT EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.company_id=r.company_id AND g.rental_id=r.id AND g.business_date=(v_run_at AT TIME ZONE r.timezone)::date) OR EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.company_id=r.company_id AND g.rental_id=r.id AND g.business_date=(v_run_at AT TIME ZONE r.timezone)::date AND(g.status='FAILED' OR(g.status='CLAIMED' AND g.claim_expires_at<=clock_timestamp()))))) INTO has_more;
 RETURN jsonb_build_object('success',true,'disposition',CASE WHEN claimed=0 THEN 'REPLAYED' ELSE 'CREATED' END,'value',jsonb_build_object('runId',v_command_id,'candidates',candidate_rows,'groupsClaimed',jsonb_array_length(candidate_rows),'groupsNoActionable',0,'hasMore',has_more,'failures',failure_rows));
END $$;

CREATE FUNCTION erp.complete_daily_grouped_customer_review_group(group_id uuid,run_id uuid,outcome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF auth.role()<>'service_role' OR outcome NOT IN('PREPARED','REPLAYED','FAILED') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 UPDATE daily_grouped_review_scheduler_groups SET status=CASE WHEN outcome='FAILED' THEN 'FAILED' ELSE 'COMPLETED' END,outcome_code=outcome,completed_at=clock_timestamp(),claim_expires_at=NULL
 WHERE id=group_id AND command_id=run_id AND(status='CLAIMED' OR status='FAILED' OR status='COMPLETED');GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('success',affected=1,'code',CASE WHEN affected=0 THEN 'CLAIM_NOT_OWNED' END);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_daily_grouped_customer_review_run(run_id uuid,result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(result)<>'object' OR result::text~*'credential|reviewPath|ciphertext|nonce|authTag|encryption' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 UPDATE daily_grouped_review_scheduler_groups SET result_summary=result WHERE command_id=run_id AND status IN('COMPLETED','FAILED');GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('groupsRecorded',affected));
END $$;

ALTER FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) OWNER TO postgres;ALTER FUNCTION erp.complete_daily_grouped_customer_review_group(uuid,uuid,text) OWNER TO postgres;ALTER FUNCTION erp.complete_daily_grouped_customer_review_run(uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb),erp.complete_daily_grouped_customer_review_group(uuid,uuid,text),erp.complete_daily_grouped_customer_review_run(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb),erp.complete_daily_grouped_customer_review_group(uuid,uuid,text),erp.complete_daily_grouped_customer_review_run(uuid,jsonb) TO service_role;
COMMENT ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) IS 'Service-only bounded, deterministic, tenant-interleaved scheduler claiming with crash-recoverable ten-minute claims; domain eligibility remains database-owned.';
COMMIT;
