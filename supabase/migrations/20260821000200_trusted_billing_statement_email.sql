BEGIN;
SET search_path=erp,public,auth,pg_catalog;

ALTER TABLE erp.notification_outbox
  ADD COLUMN initiating_actor_id text,
  ADD COLUMN correlation_id text,
  ADD COLUMN source_version bigint,
  ADD COLUMN rental_id text,
  ADD COLUMN customer_id text,
  ADD COLUMN uat_override_applied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION erp.command_send_billing_statement_email(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); actor text=auth.uid()::text; target erp.billing_statements;
  rental_record erp.rentals; company_record erp.companies; existing erp.notification_outbox;
  fingerprint text; notification_id uuid=extensions.gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id WHERE u.id=auth.uid() AND u.status='active' AND c.active)
    THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.'); END IF;
  IF NOT erp.current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','You do not have permission to send this Billing Statement.'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('statementId','commandId','idempotencyKey','expectedVersion'))
    OR nullif(btrim(command->>'statementId'),'') IS NULL OR coalesce(command->>'commandId','')!~'^[0-9a-f-]{36}$'
    OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR length(command->>'idempotencyKey')>200
    OR coalesce(command->>'expectedVersion','')!~'^[0-9]+$'
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Billing email command is invalid.'); END IF;
  SELECT * INTO target FROM erp.billing_statements WHERE id=command->>'statementId' AND company_id=tenant AND deleted_at IS NULL;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing Statement is unavailable.'); END IF;
  IF target.approval_status<>'Approved' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Only an approved Billing Statement can be emailed.'); END IF;
  IF target.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Billing Statement changed. Refresh and try again.','currentVersion',target.row_version); END IF;
  SELECT * INTO rental_record FROM erp.rentals WHERE id=target.rental_id AND company_id=tenant;
  SELECT * INTO company_record FROM erp.companies WHERE id=tenant AND active;
  IF rental_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing Statement is unavailable.'); END IF;
  IF rental_record.customer_review_email_snapshot IS NULL OR rental_record.customer_review_email_snapshot!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RETURN jsonb_build_object('success',false,'code','CUSTOMER_EMAIL_MISSING','message','Customer email address is missing.'); END IF;
  fingerprint=encode(extensions.digest(target.id||'|'||target.row_version||'|'||lower(rental_record.customer_review_email_snapshot),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':'||actor||':'||command->>'idempotencyKey',0));
  SELECT * INTO existing FROM erp.notification_outbox WHERE company_id=tenant AND idempotency_key=command->>'idempotencyKey';
  IF existing.id IS NOT NULL THEN
    IF existing.notification_type<>'BILLING_STATEMENT_EMAIL' OR existing.payload_fingerprint<>fingerprint OR existing.source_aggregate_id<>target.id
      THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.'); END IF;
    RETURN jsonb_build_object('success',true,'disposition','REPLAYED','value',jsonb_build_object('notificationId',existing.id,'status',existing.status));
  END IF;
  INSERT INTO erp.notification_outbox(id,company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,
    template_version,idempotency_key,payload_fingerprint,template_payload,initiating_actor_id,correlation_id,source_version,rental_id,customer_id)
  VALUES(notification_id,tenant,'BILLING_STATEMENT_EMAIL',lower(rental_record.customer_review_email_snapshot),coalesce(nullif(btrim(rental_record.customer_review_name_snapshot),''),'Customer Representative'),
    'BILLING_STATEMENT',target.id,1,command->>'idempotencyKey',fingerprint,
    jsonb_build_object('statementId',target.id,'statementNumber',target.statement_no,'rentalId',rental_record.id,'rentalNumber',rental_record.rental_number,'customerId',rental_record.customer_id,'companyName',company_record.name),
    actor,command->>'commandId',target.row_version,rental_record.id,rental_record.customer_id);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'BillingStatement',target.id,'BILLING_STATEMENT_EMAIL_QUEUED',actor,clock_timestamp(),command->>'commandId',
    jsonb_build_object('notificationId',notification_id,'statementNumber',target.statement_no,'rentalId',rental_record.id),jsonb_build_object('source','command_send_billing_statement_email'));
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('notificationId',notification_id,'status','Pending'));
END $$;

CREATE FUNCTION erp.audit_billing_statement_email_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  IF NEW.notification_type='BILLING_STATEMENT_EMAIL' AND OLD.status IS DISTINCT FROM 'ProviderAccepted' AND NEW.status='ProviderAccepted' THEN
    INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata)
    VALUES(extensions.gen_random_uuid()::text,NEW.company_id,'BillingStatement',NEW.source_aggregate_id,'BILLING_STATEMENT_EMAIL_SENT',NEW.initiating_actor_id,NEW.sent_at,NEW.correlation_id,
      jsonb_build_object('statementId',NEW.source_aggregate_id,'rentalId',NEW.rental_id,'customerId',NEW.customer_id,'provider',NEW.provider_name,'providerMessageId',NEW.provider_message_id,'uatOverrideApplied',NEW.uat_override_applied,
        'recipientEvidence',regexp_replace(NEW.recipient_destination,'(^.).*(@.*$)','\1***\2')),
      jsonb_build_object('notificationId',NEW.id,'source','notification_delivery'));
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER billing_statement_email_acceptance_audit AFTER UPDATE OF status ON erp.notification_outbox FOR EACH ROW EXECUTE FUNCTION erp.audit_billing_statement_email_acceptance();

CREATE FUNCTION erp.complete_billing_statement_email_delivery(command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item erp.notification_outbox;
BEGIN
  SELECT * INTO item FROM erp.notification_outbox WHERE id=(command->>'id')::uuid AND notification_type='BILLING_STATEMENT_EMAIL' FOR UPDATE;
  IF item.id IS NULL OR item.status<>'Processing' OR item.claimed_by IS DISTINCT FROM (command->>'workerId')::uuid THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.notification_outbox SET uat_override_applied=coalesce((command->>'uatOverrideApplied')::boolean,false) WHERE id=item.id;
  RETURN erp.complete_notification_delivery(command-'uatOverrideApplied');
END $$;

CREATE FUNCTION erp.get_billing_statement_email_status(statement_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); item erp.notification_outbox;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('billing.read') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO item FROM erp.notification_outbox WHERE company_id=tenant AND source_aggregate_type='BILLING_STATEMENT' AND source_aggregate_id=statement_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('success',true,'value',CASE WHEN item.id IS NULL THEN NULL ELSE jsonb_build_object('status',CASE item.status WHEN 'ProviderAccepted' THEN 'Sent' WHEN 'UnknownOutcome' THEN 'Unknown' WHEN 'Failed' THEN 'Failed' ELSE 'Pending' END,'lastEmailedAt',item.sent_at) END);
END $$;

REVOKE ALL ON FUNCTION erp.command_send_billing_statement_email(jsonb),erp.get_billing_statement_email_status(text),erp.complete_billing_statement_email_delivery(jsonb),erp.audit_billing_statement_email_acceptance() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_send_billing_statement_email(jsonb),erp.get_billing_statement_email_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp.complete_billing_statement_email_delivery(jsonb) TO service_role;
COMMIT;
