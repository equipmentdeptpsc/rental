BEGIN;
SET search_path = erp, pg_catalog;

CREATE FUNCTION erp.project_public_customer_review_batch(target_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  batch_record erp.customer_review_batches;
  projected_items jsonb;
  actionable_count integer;
  in_progress_count integer;
  acknowledged_count integer;
  correction_count integer;
  projected_status text;
BEGIN
  SELECT * INTO batch_record FROM erp.customer_review_batches WHERE id = target_batch_id;
  IF batch_record.id IS NULL THEN RETURN NULL; END IF;

  WITH projected AS (
    SELECT item.id, item.created_at, item.item_snapshot,
      CASE
        WHEN request.status = 'Acknowledged' THEN 'ACKNOWLEDGED'
        WHEN request.status = 'CorrectionRequested' THEN 'CORRECTION_REQUESTED'
        WHEN request.status = 'Pending' AND request.revoked_at IS NULL
          AND request.superseded_at IS NULL AND request.consumed_at IS NULL
          AND request.expires_at > clock_timestamp()
          AND target.id = request.revision_id AND target.id = request.deur_id
          AND target.status = 'Submitted' AND target.superseded_by_revision_id IS NULL
          AND target.row_version = request.revision_version
          AND request.permitted_actions = ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION']::text[]
          THEN 'SUBMITTED_AWAITING_ACKNOWLEDGEMENT'
        ELSE 'IN_PROGRESS'
      END AS review_state
    FROM erp.customer_review_batch_items item
    LEFT JOIN erp.customer_review_requests request
      ON request.company_id = item.company_id AND request.id = item.customer_review_request_id
    LEFT JOIN erp.deurs target
      ON target.company_id = item.company_id AND target.id = item.revision_id
    WHERE item.batch_id = target_batch_id
  )
  SELECT
    coalesce(jsonb_agg(
      item_snapshot || jsonb_build_object(
        'publicItemId', id,
        'reviewState', review_state,
        'timeline', coalesce(item_snapshot->'timeline', '[]'::jsonb),
        'availableActions', CASE WHEN review_state = 'SUBMITTED_AWAITING_ACKNOWLEDGEMENT'
          THEN jsonb_build_array('ACKNOWLEDGE','REQUEST_CORRECTION') ELSE '[]'::jsonb END
      ) ORDER BY created_at, id
    ), '[]'::jsonb),
    count(*) FILTER (WHERE review_state = 'SUBMITTED_AWAITING_ACKNOWLEDGEMENT'),
    count(*) FILTER (WHERE review_state = 'IN_PROGRESS'),
    count(*) FILTER (WHERE review_state = 'ACKNOWLEDGED'),
    count(*) FILTER (WHERE review_state = 'CORRECTION_REQUESTED')
  INTO projected_items, actionable_count, in_progress_count, acknowledged_count, correction_count
  FROM projected;

  projected_status := CASE
    WHEN actionable_count = 0 THEN 'COMPLETED'
    WHEN acknowledged_count + correction_count > 0 THEN 'PARTIALLY_REVIEWED'
    ELSE 'OPEN'
  END;

  RETURN batch_record.summary_snapshot || jsonb_build_object(
    'displayDate', to_char(batch_record.review_date, 'YYYY-MM-DD'),
    'totalLineCount', jsonb_array_length(projected_items),
    'actionableCount', actionable_count,
    'inProgressCount', in_progress_count,
    'acknowledgedCount', acknowledged_count,
    'correctionRequestedCount', correction_count,
    'batchStatus', projected_status,
    'items', projected_items
  );
END;
$$;

CREATE FUNCTION erp.get_customer_review_batch(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  batch_record erp.customer_review_batches;
  projection jsonb;
BEGIN
  IF jsonb_typeof(command) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(command)) <> 1
    OR coalesce(command->>'credential','') !~ '^[0-9a-f]{64}$'
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;

  SELECT * INTO batch_record FROM erp.customer_review_batches
  WHERE credential_hash = pg_catalog.encode(extensions.digest(command->>'credential','sha256'),'hex');
  IF batch_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF batch_record.superseded_at IS NOT NULL OR batch_record.superseded_by_batch_id IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF batch_record.expires_at <= clock_timestamp()
  THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;

  projection := erp.project_public_customer_review_batch(batch_record.id);
  RETURN jsonb_build_object('success',true,
    'disposition',CASE WHEN projection->>'batchStatus' = 'COMPLETED' THEN 'COMPLETED' ELSE 'AVAILABLE' END,
    'value',projection);
END;
$$;

CREATE FUNCTION erp.decide_customer_review_batch_item(command jsonb, requested_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  batch_record erp.customer_review_batches;
  item_record erp.customer_review_batch_items;
  request erp.customer_review_requests;
  target erp.deurs;
  now_at timestamptz := clock_timestamp();
  allowed_keys text[];
  remarks text := btrim(coalesce(command->>'remarks',''));
  idem jsonb;
  payload_hash text;
  response jsonb;
  projection jsonb;
BEGIN
  allowed_keys := CASE requested_action
    WHEN 'ACKNOWLEDGE' THEN ARRAY['credential','publicItemId','commandId','idempotencyKey']
    WHEN 'REQUEST_CORRECTION' THEN ARRAY['credential','publicItemId','commandId','idempotencyKey','remarks']
    ELSE ARRAY[]::text[] END;
  IF requested_action NOT IN ('ACKNOWLEDGE','REQUEST_CORRECTION')
    OR jsonb_typeof(command) <> 'object'
    OR coalesce(command->>'credential','') !~ '^[0-9a-f]{64}$'
    OR coalesce(command->>'publicItemId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(command) key WHERE NOT key = ANY(allowed_keys))
    OR (requested_action = 'REQUEST_CORRECTION' AND length(remarks) NOT BETWEEN 10 AND 1000)
    OR (requested_action = 'ACKNOWLEDGE' AND command ? 'remarks')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO batch_record FROM erp.customer_review_batches
  WHERE credential_hash = pg_catalog.encode(extensions.digest(command->>'credential','sha256'),'hex') FOR UPDATE;
  IF batch_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF batch_record.superseded_at IS NOT NULL OR batch_record.superseded_by_batch_id IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF batch_record.expires_at <= now_at THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;

  SELECT * INTO item_record FROM erp.customer_review_batch_items
  WHERE batch_id = batch_record.id AND id = (command->>'publicItemId')::uuid FOR UPDATE;
  IF item_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF item_record.customer_review_request_id IS NULL OR item_record.deur_id IS NULL OR item_record.revision_id IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;

  SELECT * INTO request FROM erp.customer_review_requests
  WHERE company_id = item_record.company_id AND id = item_record.customer_review_request_id
    AND rental_id = item_record.rental_id
    AND rental_equipment_line_id = item_record.rental_equipment_line_id
    AND deur_id = item_record.deur_id AND revision_id = item_record.revision_id
  FOR UPDATE;
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;

  idem := erp.begin_operational_command(command,'GROUPED_PUBLIC_REVIEW_'||requested_action,
    'CUSTOMER_REVIEW_BATCH_ITEM',item_record.id::text,request.company_id,
    'public-grouped-review:'||batch_record.id::text||':'||item_record.id::text);
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition','REPLAYED'); END IF;

  IF request.status IN ('Acknowledged','CorrectionRequested') OR request.consumed_at IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED'); END IF;
  IF request.status <> 'Pending' OR request.revoked_at IS NOT NULL OR request.superseded_at IS NOT NULL
    OR request.expires_at <= now_at OR NOT requested_action = ANY(request.permitted_actions)
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;

  SELECT * INTO target FROM erp.deurs WHERE company_id = request.company_id AND id = request.revision_id FOR UPDATE;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.rental_id IS DISTINCT FROM request.rental_id
    OR target.rental_equipment_line_id IS DISTINCT FROM request.rental_equipment_line_id
    OR target.status <> 'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.row_version IS DISTINCT FROM request.revision_version
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;
  payload_hash := idem->>'payloadHash';

  INSERT INTO erp.customer_review_outcomes(company_id,review_request_id,rental_id,deur_id,revision_id,
    action,customer_reason,recipient_name,occurred_at)
  VALUES(request.company_id,request.id,request.rental_id,request.deur_id,request.revision_id,
    requested_action,CASE WHEN requested_action='REQUEST_CORRECTION' THEN remarks END,request.recipient_name,now_at);

  IF requested_action = 'ACKNOWLEDGE' THEN
    UPDATE erp.deurs SET status='Acknowledged',acknowledged_at=now_at,
      acknowledged_by=request.recipient_name,acknowledgement_remarks=NULL WHERE id=target.id RETURNING * INTO target;
    INSERT INTO erp.deur_review_history(id,deur_id,action,actor_name,occurred_at,company_id)
      VALUES(extensions.gen_random_uuid()::text,target.id,'acknowledged',request.recipient_name,now_at,request.company_id);
    UPDATE erp.customer_review_requests SET status='Acknowledged',consumed_at=now_at,row_version=row_version+1 WHERE id=request.id;
  ELSE
    INSERT INTO erp.customer_correction_requests(company_id,review_request_id,source_revision_id,customer_reason)
      VALUES(request.company_id,request.id,request.revision_id,remarks);
    UPDATE erp.customer_review_requests SET status='CorrectionRequested',consumed_at=now_at,
      customer_comment=remarks,row_version=row_version+1 WHERE id=request.id;
  END IF;

  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,request.company_id,'CUSTOMER_REVIEW',request.id::text,
    requested_action,NULL,now_at,command->>'commandId',jsonb_build_object('revisionId',request.revision_id,
      'batchItemPublicId',item_record.id,'reason',CASE WHEN requested_action='REQUEST_CORRECTION' THEN remarks END));

  projection := erp.project_public_customer_review_batch(batch_record.id);
  response := jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'value',projection);
  RETURN erp.finish_operational_command(command,'GROUPED_PUBLIC_REVIEW_'||requested_action,
    'CUSTOMER_REVIEW_BATCH_ITEM',item_record.id::text,request.company_id,
    'public-grouped-review:'||batch_record.id::text||':'||item_record.id::text,
    payload_hash,response,target.row_version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED');
END;
$$;

CREATE FUNCTION erp.acknowledge_customer_review_batch_item(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT erp.decide_customer_review_batch_item(command,'ACKNOWLEDGE')
$$;

CREATE FUNCTION erp.request_customer_review_batch_item_correction(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT erp.decide_customer_review_batch_item(command,'REQUEST_CORRECTION')
$$;

ALTER FUNCTION erp.project_public_customer_review_batch(uuid) OWNER TO postgres;
ALTER FUNCTION erp.get_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.decide_customer_review_batch_item(jsonb,text) OWNER TO postgres;
ALTER FUNCTION erp.acknowledge_customer_review_batch_item(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.request_customer_review_batch_item_correction(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION erp.project_public_customer_review_batch(uuid),
  erp.decide_customer_review_batch_item(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.get_customer_review_batch(jsonb),
  erp.acknowledge_customer_review_batch_item(jsonb),
  erp.request_customer_review_batch_item_correction(jsonb) FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.get_customer_review_batch(jsonb),
  erp.acknowledge_customer_review_batch_item(jsonb),
  erp.request_customer_review_batch_item_correction(jsonb) TO anon;

COMMENT ON FUNCTION erp.get_customer_review_batch(jsonb) IS
  'Anonymous-safe reusable grouped credential lookup. Tenant and canonical identities are derived server-side.';
COMMENT ON FUNCTION erp.decide_customer_review_batch_item(jsonb,text) IS
  'Internal atomic per-line decision helper. Writes only canonical customer review outcome/correction evidence.';

CREATE OR REPLACE FUNCTION erp.reject_terminal_notification_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND (
    (current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR
    (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001') OR
    (current_setting('erp.c12_customer_email_fixture_cleanup',true)='TENANT-UAT-C12-CUSTOMER-EMAIL-001' AND OLD.company_id='TENANT-UAT-C12-CUSTOMER-EMAIL-001') OR
    (current_setting('erp.c12_manager_email_fixture_cleanup',true)='TENANT-UAT-C12-MANAGER-EMAIL-001' AND OLD.company_id='TENANT-UAT-C12-MANAGER-EMAIL-001') OR
    (current_setting('erp.c12_grouped_review_fixture_cleanup',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001' AND OLD.company_id='TENANT-UAT-C12-GROUPED-CUSTOMER-001')
  ) THEN RETURN OLD; END IF;
  IF OLD.status='ProviderAccepted' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'provider-accepted notification evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION erp.reject_terminal_notification_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.reject_terminal_notification_change() FROM PUBLIC,anon,authenticated,service_role;

-- The certified fixture now legitimately contains two canonical outcomes and
-- lifecycle notification intents from the two independent public decisions.
-- Expand only those guards; provider attempts remain forbidden at zero.
DO $$
DECLARE cleanup_definition text;
BEGIN
  SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure)
    INTO cleanup_definition;
  cleanup_definition := replace(cleanup_definition,
    '(SELECT count(*) FROM customer_review_outcomes WHERE company_id=target_tenant_id)>1',
    '(SELECT count(*) FROM customer_review_outcomes WHERE company_id=target_tenant_id)>2');
  cleanup_definition := replace(cleanup_definition,
    '(SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id)>0',
    '(SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id)>3');
  cleanup_definition := replace(cleanup_definition,
    '  DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code AND environment_class=''test''; GET DIAGNOSTICS affected=ROW_COUNT; removed:=removed||jsonb_build_object(''companies'',affected);',
    '  DELETE FROM notification_delivery_attempts WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed:=jsonb_set(removed,''{notification_delivery_attempts}'',to_jsonb(coalesce((removed->>''notification_delivery_attempts'')::integer,0)+affected));
  DELETE FROM notification_outbox WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed:=jsonb_set(removed,''{notification_outbox}'',to_jsonb(coalesce((removed->>''notification_outbox'')::integer,0)+affected));
  DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code AND environment_class=''test''; GET DIAGNOSTICS affected=ROW_COUNT; removed:=removed||jsonb_build_object(''companies'',affected);');
  IF cleanup_definition NOT LIKE '%customer_review_outcomes WHERE company_id=target_tenant_id)>2%'
    OR cleanup_definition NOT LIKE '%notification_outbox WHERE company_id=target_tenant_id)>3%'
    OR cleanup_definition NOT LIKE '%notification_delivery_attempts WHERE company_id=target_tenant_id)>0%'
    OR cleanup_definition NOT LIKE '%jsonb_set(removed,''{notification_outbox}''%'
  THEN RAISE EXCEPTION '06100 cleanup boundary expansion did not match certified 06000 definition' USING ERRCODE='55000'; END IF;
  EXECUTE cleanup_definition;
END;
$$;
ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) IS
  'Owner-only exact cleanup for the three-line grouped public Customer Review certification; permits two canonical outcomes and at most three lifecycle intents while provider attempts remain forbidden; auth.users excluded.';

COMMIT;
