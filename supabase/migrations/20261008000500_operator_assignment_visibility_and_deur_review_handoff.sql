BEGIN;
SET search_path=erp,auth,extensions,pg_catalog;

-- Narrow mobile projection. Identity is always derived from the authenticated
-- application user and no commercial/customer data is returned.
CREATE FUNCTION erp.read_current_operator_assignments()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
  WITH identity AS (
    SELECT erp.current_company_id() company_id,erp.current_active_operator_id() operator_id
  ), rows AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'assignment',jsonb_build_object('id',a.id,'status',a.status,'projectId',a.project_id,'projectName',p.name,'operatorId',o.id,'operatorDisplayName',o.name),
      'equipment',jsonb_build_object('id',e.id,'name',e.equipment_name,'assetNumber',e.asset_no,'currentReading',e.current_reading),
      'rental',jsonb_build_object('id',coalesce(r.id,'assignment:'||a.id),'rentalNumber',coalesce(r.rental_number,'Preparation pending'),'status',coalesce(r.status::text,'Preparation pending')),
      'rentalLine',jsonb_build_object('id',coalesce(line.id,'assignment:'||a.id),'status',coalesce(line.status::text,'Preparation pending'),'operationalMetadata',coalesce(line.operational_metadata,'{}'::jsonb)),
      'deurEligible',coalesce(r.status='Active' AND line.status='Active',false)
    )) value
    FROM identity i
    JOIN erp.assignments a ON a.company_id=i.company_id AND a.operator_id=i.operator_id AND a.status='Active' AND a.deleted_at IS NULL
    JOIN erp.operators o ON o.company_id=a.company_id AND o.id=a.operator_id AND o.status='Active' AND o.deleted_at IS NULL
    JOIN erp.equipment e ON e.company_id=a.company_id AND e.id=a.equipment_id AND e.deleted_at IS NULL
    JOIN erp.projects p ON p.company_id=a.company_id AND p.id=a.project_id AND p.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT candidate.* FROM erp.rental_equipment_lines candidate
      WHERE candidate.company_id=a.company_id AND candidate.assignment_id=a.id AND candidate.operator_id=a.operator_id AND candidate.deleted_at IS NULL AND candidate.status<>'Cancelled'
      ORDER BY CASE candidate.status WHEN 'Active' THEN 0 WHEN 'Released' THEN 1 ELSE 2 END,candidate.created_at DESC,candidate.id LIMIT 1
    ) line ON true
    LEFT JOIN erp.rentals r ON r.company_id=a.company_id AND r.id=line.rental_id
    ORDER BY a.assigned_date DESC,a.id
  )
  SELECT jsonb_build_object('success',true,'assignments',coalesce(jsonb_agg(value),'[]'::jsonb)) FROM rows
$$;
ALTER FUNCTION erp.read_current_operator_assignments() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_current_operator_assignments() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_current_operator_assignments() TO authenticated;

-- The canonical generator remains the only request/batch builder. This private
-- transaction marker lets the already-authorized submit command invoke it
-- without granting the Operator the broader review-issuance permission.
DO $$
DECLARE definition text; needle text := 'IF NOT (erp.current_user_has_permission(''deur.customerReview.issue'') OR erp.current_user_has_permission(''deur.review'')) THEN RETURN jsonb_build_object(''success'',false,''code'',''FORBIDDEN''); END IF;';
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'review generator authorization marker changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,needle,'IF NOT (erp.current_user_has_permission(''deur.customerReview.issue'') OR erp.current_user_has_permission(''deur.review'')) AND current_setting(''erp.deur_submit_review_handoff'',true)<>''true'' THEN RETURN jsonb_build_object(''success'',false,''code'',''FORBIDDEN''); END IF;');
  EXECUTE definition;
END $$;

CREATE FUNCTION erp.enqueue_submitted_deur_customer_review(target_deur_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE target erp.deurs; rental erp.rentals; batch erp.customer_review_batches; generated jsonb; intent erp.notification_outbox;
  identity text; payload jsonb; recipient_name text; recipient_destination text;
BEGIN
  SELECT * INTO target FROM erp.deurs WHERE id=target_deur_id AND company_id=erp.current_company_id() FOR UPDATE;
  IF target.id IS NULL OR target.status<>'Submitted' OR target.submitted_by IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'submitted DEUR handoff scope rejected' USING ERRCODE='42501'; END IF;
  SELECT * INTO rental FROM erp.rentals WHERE company_id=target.company_id AND id=target.rental_id;
  IF rental.id IS NULL OR nullif(btrim(rental.customer_review_name_snapshot),'') IS NULL OR lower(btrim(coalesce(rental.customer_review_email_snapshot,''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Rental Customer Review recipient snapshot unavailable' USING ERRCODE='55000'; END IF;
  PERFORM pg_catalog.set_config('erp.deur_submit_review_handoff','true',true);
  generated:=erp.command_generate_customer_review_batch(jsonb_build_object(
    'commandId','deur-submit-review:'||target.id||':'||target.row_version,
    'idempotencyKey','deur-submit-review:'||target.id||':'||target.row_version,
    'rentalId',target.rental_id));
  IF generated->>'success'<>'true' OR coalesce(generated#>>'{value,batchId}','')='' THEN RAISE EXCEPTION 'Customer Review batch handoff failed (%)',coalesce(generated->>'code',generated->>'disposition','UNKNOWN') USING ERRCODE='55000'; END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(generated#>>'{value,batchId}')::uuid AND company_id=target.company_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM erp.customer_review_batch_items item WHERE item.batch_id=batch.id AND item.deur_id=target.id AND item.customer_review_request_id IS NOT NULL) THEN RAISE EXCEPTION 'Submitted DEUR was not included in Customer Review batch' USING ERRCODE='55000'; END IF;
  recipient_name=btrim(rental.customer_review_name_snapshot); recipient_destination=lower(btrim(rental.customer_review_email_snapshot));
  identity='customer-grouped-review:'||batch.id::text||':submit-v1';
  payload=jsonb_build_object('recipientName',recipient_name,'companyName',batch.summary_snapshot->>'company','customerName',batch.summary_snapshot->>'customer','projectName',batch.summary_snapshot->>'project','rentalReference',batch.summary_snapshot->>'rental','reviewDate',batch.review_date,'expirationLabel',batch.expires_at,'totalLineCount',coalesce((batch.summary_snapshot->>'totalLineCount')::integer,0),'actionableCount',coalesce((batch.summary_snapshot->>'actionableCount')::integer,0),'inProgressCount',coalesce((batch.summary_snapshot->>'inProgressCount')::integer,0),'acknowledgedCount',coalesce((batch.summary_snapshot->>'acknowledgedCount')::integer,0));
  INSERT INTO erp.notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
  VALUES(target.company_id,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,'CUSTOMER_REVIEW_BATCH',batch.id::text,3,identity,pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),payload,true)
  ON CONFLICT(company_id,idempotency_key) DO UPDATE SET updated_at=notification_outbox.updated_at RETURNING * INTO intent;
  RETURN jsonb_build_object('success',true,'batchId',batch.id,'notificationIntentId',intent.id);
END $$;
ALTER FUNCTION erp.enqueue_submitted_deur_customer_review(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enqueue_submitted_deur_customer_review(text) FROM PUBLIC,anon,authenticated,service_role;

-- Attach the encrypted path to the pending outbox record before the existing
-- worker claim path sees it. Plaintext credentials remain process memory only.
CREATE FUNCTION erp.read_pending_submitted_deur_review_handoffs(batch_size integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
BEGIN
  IF auth.role()<>'service_role' OR batch_size NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  RETURN jsonb_build_object('success',true,'value',coalesce((SELECT jsonb_agg(jsonb_build_object('notificationId',candidate.id,'batchId',candidate.source_aggregate_id)) FROM (SELECT n.id,n.source_aggregate_id FROM erp.notification_outbox n WHERE n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.idempotency_key LIKE 'customer-grouped-review:%:submit-v1' AND n.status='Pending' AND n.requires_review_credential AND NOT EXISTS(SELECT 1 FROM erp.notification_delivery_envelopes envelope WHERE envelope.notification_id=n.id AND envelope.retired_at IS NULL) ORDER BY n.created_at LIMIT batch_size) candidate),'[]'::jsonb));
END $$;

CREATE FUNCTION erp.prepare_submitted_deur_review_handoff(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE intent erp.notification_outbox; batch erp.customer_review_batches; active_count integer;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR coalesce(command->>'notificationId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'batchId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'credentialHash','')!~'^[0-9a-f]{64}$' OR command->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH' OR command->>'envelopeVersion'<>'1' OR command->>'keyVersion'<>'1' OR coalesce(command->>'ciphertext','')!~'^[A-Za-z0-9+/]+={0,2}$' OR coalesce(command->>'nonce','')!~'^[A-Za-z0-9+/]{16}$' OR coalesce(command->>'authTag','')!~'^[A-Za-z0-9+/]{22}==$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO intent FROM erp.notification_outbox WHERE id=(command->>'notificationId')::uuid AND source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND source_aggregate_id=command->>'batchId' AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND status='Pending' AND requires_review_credential FOR UPDATE;
  IF intent.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT count(*) INTO active_count FROM erp.notification_delivery_envelopes WHERE notification_id=intent.id AND retired_at IS NULL;
  IF active_count=1 THEN RETURN jsonb_build_object('success',true,'disposition','REPLAYED'); END IF;
  IF active_count<>0 THEN RETURN jsonb_build_object('success',false,'code','PREPARATION_INTEGRITY'); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(command->>'batchId')::uuid AND company_id=intent.company_id AND finalized_at IS NOT NULL AND superseded_at IS NULL AND retired_no_actionable_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_NOT_ACTIONABLE'); END IF;
  PERFORM pg_catalog.set_config('erp.grouped_review_existing_batch_preparation',batch.id::text,true);
  UPDATE erp.customer_review_batches SET credential_hash=command->>'credentialHash',row_version=row_version+1 WHERE id=batch.id;
  INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,ciphertext,nonce,auth_tag,key_version,credential_hash) VALUES(intent.id,command->>'envelopeType',1,command->>'ciphertext',command->>'nonce',command->>'authTag',1,command->>'credentialHash');
  RETURN jsonb_build_object('success',true,'disposition','PREPARED');
END $$;
ALTER FUNCTION erp.read_pending_submitted_deur_review_handoffs(integer) OWNER TO postgres;
ALTER FUNCTION erp.prepare_submitted_deur_review_handoff(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_pending_submitted_deur_review_handoffs(integer),erp.prepare_submitted_deur_review_handoff(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_pending_submitted_deur_review_handoffs(integer),erp.prepare_submitted_deur_review_handoff(jsonb) TO service_role;

-- Active Assignment visibility is independent from DEUR creation. The start
-- command itself now fails closed unless both Rental and line are Active.
DO $$
DECLARE definition text; line_marker text := 'snap:=nullif(line.operational_metadata->''deurExpectationSnapshot'',''null''::jsonb); policy:=snap->>''meterRequirement'';'; submit_marker text := 'response:=jsonb_build_object(''success'',true,''disposition'',''ACCEPTED'',''record'',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence';
BEGIN
  SELECT pg_get_functiondef('erp.command_start_deur_shift(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,line_marker,'')))/length(line_marker)<>1 THEN RAISE EXCEPTION 'DEUR start eligibility marker changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,line_marker,line_marker||' IF line.status<>''Active'' OR NOT EXISTS(SELECT 1 FROM erp.rentals active_rental WHERE active_rental.company_id=line.company_id AND active_rental.id=line.rental_id AND active_rental.status=''Active'') THEN RETURN jsonb_build_object(''success'',false,''code'',''RENTAL_NOT_ACTIVE''); END IF;');
  EXECUTE definition;
  SELECT pg_get_functiondef('erp.command_submit_deur(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,submit_marker,'')))/length(submit_marker)<>1 THEN RAISE EXCEPTION 'DEUR submit response marker changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,submit_marker,'PERFORM erp.enqueue_submitted_deur_customer_review(current_deur.id); '||submit_marker);
  EXECUTE definition;
END $$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb),erp.command_start_deur_shift(jsonb),erp.command_submit_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb),erp.command_start_deur_shift(jsonb),erp.command_submit_deur(jsonb) TO authenticated;

COMMENT ON FUNCTION erp.read_current_operator_assignments() IS 'Role-safe current Operator Assignment projection. Returns only the authenticated Operator own active Assignment and operational lifecycle data.';
COMMENT ON FUNCTION erp.prepare_submitted_deur_review_handoff(jsonb) IS 'Service-only encrypted credential preparation for the existing pending submit-created grouped review outbox intent.';
COMMENT ON FUNCTION erp.command_start_deur_shift(jsonb) IS 'Canonical digital DEUR start. Rental and Rental line must both be Active at the authoritative server boundary.';
COMMENT ON FUNCTION erp.command_submit_deur(jsonb) IS 'Canonical digital DEUR submit with idempotent grouped Customer Review request and asynchronous outbox handoff.';

COMMIT;
