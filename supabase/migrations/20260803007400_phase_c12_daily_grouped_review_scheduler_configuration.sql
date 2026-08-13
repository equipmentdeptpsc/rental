BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE TABLE erp.grouped_review_scheduler_configurations(
 company_id text PRIMARY KEY REFERENCES erp.companies(id),
 automation_enabled boolean NOT NULL DEFAULT false,
 local_send_time time without time zone NOT NULL,
 grace_minutes integer NOT NULL CHECK(grace_minutes BETWEEN 15 AND 180),
 configured_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 row_version bigint NOT NULL DEFAULT 1,
 CONSTRAINT ck_grouped_review_scheduler_window_same_day
   CHECK(extract(epoch FROM local_send_time)+grace_minutes*60<86400)
);
ALTER TABLE erp.grouped_review_scheduler_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.grouped_review_scheduler_configurations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.command_configure_grouped_review_scheduler(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); actor uuid=auth.uid(); send_time time; grace integer; enabled boolean;
 current_config erp.grouped_review_scheduler_configurations; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp(); next_version bigint;
BEGIN
 IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('users.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('commandId','idempotencyKey','automationEnabled','localSendTime','graceMinutes'))
  OR coalesce(command->>'commandId','')!~'^[0-9a-f-]{36}$' OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR length(command->>'idempotencyKey')>200
  OR jsonb_typeof(command->'automationEnabled')<>'boolean' OR coalesce(command->>'localSendTime','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR coalesce(command->>'graceMinutes','')!~'^[0-9]+$'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN send_time=(command->>'localSendTime')::time;grace=(command->>'graceMinutes')::integer;enabled=(command->>'automationEnabled')::boolean;
 EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF grace NOT BETWEEN 15 AND 180 OR extract(epoch FROM send_time)+grace*60>=86400
 THEN RETURN jsonb_build_object('success',false,'code','INVALID_SEND_WINDOW');END IF;
 IF enabled AND NOT EXISTS(SELECT 1 FROM erp.system_principals s JOIN erp.system_principal_permissions p ON p.principal_id=s.id
   WHERE s.company_id=tenant AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule')
 THEN RETURN jsonb_build_object('success',false,'code','SCHEDULER_NOT_READY');END IF;
 idem=erp.begin_operational_command(command,'CONFIGURE_GROUPED_REVIEW_SCHEDULER','COMPANY',tenant,tenant,actor::text);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');END IF;
 IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;
 IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';
 SELECT * INTO current_config FROM erp.grouped_review_scheduler_configurations WHERE company_id=tenant FOR UPDATE;
 next_version=coalesce(current_config.row_version,0)+1;
 INSERT INTO erp.grouped_review_scheduler_configurations(company_id,automation_enabled,local_send_time,grace_minutes,configured_by,row_version)
 VALUES(tenant,enabled,send_time,grace,actor,next_version)
 ON CONFLICT(company_id) DO UPDATE SET automation_enabled=excluded.automation_enabled,local_send_time=excluded.local_send_time,
  grace_minutes=excluded.grace_minutes,configured_by=excluded.configured_by,updated_at=now_at,row_version=excluded.row_version;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
 VALUES(extensions.gen_random_uuid()::text,tenant,'GROUPED_REVIEW_SCHEDULER_CONFIGURATION',tenant,'CONFIGURED',actor::text,now_at,command->>'commandId',
  CASE WHEN current_config.company_id IS NULL THEN NULL ELSE jsonb_build_object('automationEnabled',current_config.automation_enabled,'localSendTime',to_char(current_config.local_send_time,'HH24:MI'),'graceMinutes',current_config.grace_minutes,'rowVersion',current_config.row_version) END,
  jsonb_build_object('automationEnabled',enabled,'localSendTime',to_char(send_time,'HH24:MI'),'graceMinutes',grace,'rowVersion',next_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(tenant),
  'value',jsonb_build_object('companyId',tenant,'automationEnabled',enabled,'schedulerReady',true,'localSendTime',to_char(send_time,'HH24:MI'),'graceMinutes',grace,'rowVersion',next_version));
 RETURN erp.finish_operational_command(command,'CONFIGURE_GROUPED_REVIEW_SCHEDULER','COMPANY',tenant,tenant,actor::text,payload_hash,response,next_version);
END $$;

CREATE OR REPLACE FUNCTION erp.command_run_daily_grouped_customer_reviews(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE run_at timestamptz;v_command_id uuid;idem text;candidate_rows jsonb;failure_rows jsonb;evaluated integer;no_action integer;inserted integer;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('commandId','idempotencyKey','runAt'))
  OR coalesce(command->>'commandId','')!~'^[0-9a-f-]{36}$' OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR length(command->>'idempotencyKey')>200
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN v_command_id=(command->>'commandId')::uuid;run_at=(command->>'runAt')::timestamptz;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 idem=btrim(command->>'idempotencyKey');
 IF EXISTS(SELECT 1 FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=v_command_id AND g.idempotency_key<>idem)
 THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');END IF;
 SELECT count(*) INTO evaluated FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled WHERE r.status IN('Released','Active');
 WITH eligible AS(
  SELECT r.company_id,r.customer_id,r.project_id,r.id rental_id,r.timezone,(run_at AT TIME ZONE r.timezone)::date business_date
  FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled
  WHERE r.status IN('Released','Active') AND EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone)
   AND (run_at AT TIME ZONE r.timezone)::time>=c.local_send_time
   AND (run_at AT TIME ZONE r.timezone)::time<c.local_send_time+make_interval(mins=>c.grace_minutes)
   AND EXISTS(SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id
     WHERE s.company_id=r.company_id AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule')
   AND NOT EXISTS(SELECT 1 FROM customer_review_batches b WHERE b.company_id=r.company_id AND b.rental_id=r.id AND b.review_date=(run_at AT TIME ZONE r.timezone)::date)
   AND EXISTS(SELECT 1 FROM rental_equipment_lines l JOIN deurs d ON d.company_id=l.company_id AND d.rental_equipment_line_id=l.id AND d.superseded_by_revision_id IS NULL
    LEFT JOIN LATERAL(SELECT q.* FROM customer_review_requests q WHERE q.company_id=d.company_id AND q.revision_id=d.id ORDER BY q.created_at DESC LIMIT 1) q ON true
    WHERE l.company_id=r.company_id AND l.rental_id=r.id AND l.deleted_at IS NULL AND d.status='Submitted'
     AND(q.id IS NULL OR(q.status='Pending' AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL AND q.expires_at>run_at)))
 ),ins AS(
  INSERT INTO daily_grouped_review_scheduler_groups(command_id,idempotency_key,company_id,customer_id,project_id,rental_id,business_date,business_timezone,run_at)
  SELECT v_command_id,idem,e.company_id,e.customer_id,e.project_id,e.rental_id,e.business_date,e.timezone,run_at FROM eligible e
  ON CONFLICT(command_id,company_id,rental_id,business_date) DO NOTHING RETURNING *
 ) SELECT count(*) INTO inserted FROM ins;
 SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',g.company_id,'customerId',g.customer_id,'projectId',g.project_id,'rentalId',g.rental_id,'businessDate',g.business_date,'timezone',g.business_timezone) ORDER BY g.company_id,g.rental_id),'[]'::jsonb)
 INTO candidate_rows FROM daily_grouped_review_scheduler_groups g WHERE g.command_id=v_command_id;
 SELECT coalesce(jsonb_agg(failure ORDER BY failure->>'companyId',failure->>'rentalId'),'[]'::jsonb) INTO failure_rows FROM(
  SELECT jsonb_build_object('companyId',r.company_id,'rentalId',r.id,'code','INVALID_TIMEZONE') failure
  FROM rentals r JOIN grouped_review_scheduler_configurations c ON c.company_id=r.company_id AND c.automation_enabled
  WHERE r.status IN('Released','Active') AND(nullif(btrim(r.timezone),'') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=r.timezone))
  UNION ALL
  SELECT jsonb_build_object('companyId',c.company_id,'code','SCHEDULER_NOT_READY')
  FROM grouped_review_scheduler_configurations c WHERE c.automation_enabled AND NOT EXISTS(
   SELECT 1 FROM system_principals s JOIN system_principal_permissions p ON p.principal_id=s.id
   WHERE s.company_id=c.company_id AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND s.active AND p.permission_code='grouped_review.schedule')
 ) failures;
 no_action=greatest(0,evaluated-jsonb_array_length(candidate_rows)-jsonb_array_length(failure_rows));
 RETURN jsonb_build_object('success',true,'disposition',CASE WHEN inserted=0 THEN 'REPLAYED' ELSE 'CREATED' END,'value',jsonb_build_object(
  'runId',v_command_id,'disposition',CASE WHEN inserted=0 THEN 'REPLAYED' ELSE 'CREATED' END,'candidates',candidate_rows,'groupsEvaluated',evaluated,'groupsNoActionable',no_action,'failures',failure_rows));
END $$;

DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'(SELECT count(*) FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>2',
  '(SELECT count(*) FROM grouped_review_scheduler_configurations WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id)>2');
 definition:=replace(definition,'DELETE FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id;',
  'DELETE FROM daily_grouped_review_scheduler_groups WHERE company_id=target_tenant_id; DELETE FROM grouped_review_scheduler_configurations WHERE company_id=target_tenant_id;');
 IF definition NOT LIKE '%grouped_review_scheduler_configurations WHERE company_id=target_tenant_id)>1%'
  OR definition NOT LIKE '%DELETE FROM grouped_review_scheduler_configurations WHERE company_id=target_tenant_id;%'
 THEN RAISE EXCEPTION '07400 scheduler configuration cleanup extension did not match certified boundary' USING ERRCODE='55000';END IF;EXECUTE definition;
END $$;

ALTER FUNCTION erp.command_configure_grouped_review_scheduler(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_configure_grouped_review_scheduler(jsonb),erp.command_run_daily_grouped_customer_reviews(jsonb),erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_configure_grouped_review_scheduler(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) TO service_role;
COMMENT ON TABLE erp.grouped_review_scheduler_configurations IS 'One tenant-scoped automation kill switch and Rental-local send-window configuration; runtime readiness is derived from the canonical scheduler principal and permission.';
COMMENT ON FUNCTION erp.command_run_daily_grouped_customer_reviews(jsonb) IS 'Service-only canonical discovery: tenant enablement, derived principal readiness, Rental timezone/send window, actionable evidence, and same-date anti-flood remain database authority.';
COMMIT;
