BEGIN;
SET search_path TO erp, public;

CREATE TABLE recovery_compensations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  target_entity_type text NOT NULL CHECK(target_entity_type IN('RENTAL','RENTAL_RETURN','BILLING_STATEMENT','DEUR_CONSUMPTION','INVOICE')),
  target_entity_id text NOT NULL,
  original_reference text,
  recovery_action text NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  initiated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  prior_state jsonb NOT NULL,
  resulting_state jsonb NOT NULL,
  prior_version bigint NOT NULL,
  resulting_version bigint NOT NULL,
  command_id text,
  idempotency_key text NOT NULL,
  UNIQUE(company_id,target_entity_type,target_entity_id,recovery_action),
  UNIQUE(company_id,initiated_by,idempotency_key)
);
CREATE INDEX ix_recovery_target ON recovery_compensations(company_id,target_entity_type,target_entity_id,initiated_at);
ALTER TABLE recovery_compensations ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_compensations_tenant_read ON recovery_compensations FOR SELECT TO authenticated
  USING(company_id=current_company_id());
REVOKE INSERT,UPDATE,DELETE ON recovery_compensations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON recovery_compensations TO authenticated;
CREATE TRIGGER recovery_compensations_immutable BEFORE UPDATE OR DELETE ON recovery_compensations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

ALTER TABLE billing_statement_lines
  ADD COLUMN consumption_released_at timestamptz,
  ADD COLUMN consumption_released_by uuid REFERENCES auth.users(id),
  ADD COLUMN consumption_recovery_id uuid REFERENCES recovery_compensations(id);
ALTER TABLE billing_statement_lines ADD CONSTRAINT ck_billing_consumption_release
  CHECK (
    (consumption_released_at IS NULL AND consumption_released_by IS NULL AND consumption_recovery_id IS NULL)
    OR
    (consumption_released_at IS NOT NULL AND consumption_released_by IS NOT NULL AND consumption_recovery_id IS NOT NULL)
  );
DROP INDEX uq_active_deur_billing;
DROP INDEX uq_active_revision_billing;
CREATE UNIQUE INDEX uq_active_deur_billing ON billing_statement_lines(deur_id)
  WHERE consumption_released_at IS NULL;
CREATE UNIQUE INDEX uq_active_revision_billing ON billing_statement_lines(deur_revision_chain_id)
  WHERE deur_revision_chain_id IS NOT NULL AND consumption_released_at IS NULL;

CREATE OR REPLACE FUNCTION protect_statement_line() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE state billing_approval_status;
BEGIN
  SELECT approval_status INTO state FROM billing_statements WHERE id=coalesce(OLD.billing_statement_id,NEW.billing_statement_id);
  IF state <> 'Draft' THEN
    IF TG_OP='UPDATE' AND current_setting('erp.deur_consumption_release',true)='on'
       AND OLD.consumption_released_at IS NULL AND NEW.consumption_released_at IS NOT NULL
       AND (to_jsonb(NEW)-'consumption_released_at'-'consumption_released_by'-'consumption_recovery_id')
           =(to_jsonb(OLD)-'consumption_released_at'-'consumption_released_by'-'consumption_recovery_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'non-draft billing evidence is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION record_recovery_compensation(
  tenant text, target_type text, target_id text, original_reference text,
  action text, reason text, actor uuid, command_id text, idempotency_key text,
  prior_state jsonb, resulting_state jsonb, prior_version bigint, resulting_version bigint
) RETURNS recovery_compensations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp AS $$
DECLARE recovery recovery_compensations;
BEGIN
  INSERT INTO recovery_compensations(
    company_id,target_entity_type,target_entity_id,original_reference,recovery_action,reason,
    initiated_by,command_id,idempotency_key,prior_state,resulting_state,prior_version,resulting_version
  ) VALUES(
    tenant,target_type,target_id,nullif(original_reference,''),action,btrim(reason),
    actor,command_id,idempotency_key,prior_state,resulting_state,prior_version,resulting_version
  ) RETURNING * INTO recovery;
  RETURN recovery;
END $$;

CREATE FUNCTION command_reopen_rental(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor uuid=auth.uid(); rental rentals; recovery recovery_compensations;
  idem jsonb; payload_hash text; response jsonb; prior_version bigint; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=actor AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental management permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF length(btrim(coalesce(command->>'reason',''))) < 10 OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A meaningful recovery reason is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'REOPEN_RENTAL','RENTAL',rental.id,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF rental.row_version<>coalesce((command->>'expectedVersion')::bigint,rental.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Rental version is stale.','retryable',false,'refreshRequired',true,'currentVersion',rental.row_version); END IF;
  IF rental.status<>'Closed' THEN RETURN jsonb_build_object('success',false,'code',CASE WHEN EXISTS(SELECT 1 FROM recovery_compensations WHERE company_id=tenant AND target_entity_type='RENTAL' AND target_entity_id=rental.id AND recovery_action='REOPEN') THEN 'ALREADY_REVERSED' ELSE 'RECOVERY_NOT_ALLOWED' END,'message','Rental cannot be reopened from its current state.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM billing_statements WHERE rental_id=rental.id AND company_id=tenant AND invoice_status<>'Cancelled')
     OR EXISTS(SELECT 1 FROM deurs WHERE rental_id=rental.id AND company_id=tenant AND (billing_locked OR status='Billed')) THEN
    RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_EVIDENCE_EXISTS','message','Active financial evidence prevents Rental recovery.','retryable',false,'refreshRequired',false);
  END IF;
  prior_version=rental.row_version;
  UPDATE rentals SET status='Returned',closed_at=NULL,updated_by=actor::text WHERE id=rental.id RETURNING * INTO rental;
  UPDATE rental_equipment_lines SET status='Returned',updated_by=actor::text WHERE rental_id=rental.id AND status='Closed';
  recovery=record_recovery_compensation(tenant,'RENTAL',rental.id,command->>'originalReference','REOPEN',command->>'reason',actor,
    command->>'commandId',command->>'idempotencyKey',jsonb_build_object('status','Closed'),jsonb_build_object('status','Returned'),prior_version,rental.row_version);
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'RENTAL',rental.id,'REOPEN_COMPENSATION',actor::text,now_at,command->>'commandId',
    jsonb_build_object('status','Closed'),jsonb_build_object('status','Returned','version',rental.row_version),jsonb_build_object('recoveryId',recovery.id,'reason',command->>'reason'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(rental.id),
    'value',jsonb_build_object('recoveryId',recovery.id,'targetId',rental.id,'action','REOPEN','status','Returned','version',rental.row_version));
  RETURN finish_operational_command(command,'REOPEN_RENTAL','RENTAL',rental.id,tenant,actor::text,payload_hash,response,rental.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Rental recovery already exists.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Rental recovery could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_reverse_rental_return(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor uuid=auth.uid(); rental rentals; recovery recovery_compensations; line rental_equipment_lines;
  idem jsonb; payload_hash text; response jsonb; prior_version bigint; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=actor AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental return permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF length(btrim(coalesce(command->>'reason',''))) < 10 OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A meaningful recovery reason is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental is unavailable.','retryable',false,'refreshRequired',false); END IF;
  PERFORM l.id FROM rental_equipment_lines l WHERE l.rental_id=rental.id AND l.company_id=tenant ORDER BY l.equipment_id FOR UPDATE;
  PERFORM e.id FROM equipment e JOIN rental_equipment_lines l ON l.equipment_id=e.id WHERE l.rental_id=rental.id ORDER BY e.id FOR UPDATE;
  idem=begin_operational_command(command,'REVERSE_RENTAL_RETURN','RENTAL',rental.id,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF rental.row_version<>coalesce((command->>'expectedVersion')::bigint,rental.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Rental version is stale.','retryable',false,'refreshRequired',true,'currentVersion',rental.row_version); END IF;
  IF rental.status<>'Returned' THEN RETURN jsonb_build_object('success',false,'code','RECOVERY_NOT_ALLOWED','message','Rental return cannot be reversed from its current state.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM billing_statements WHERE rental_id=rental.id AND company_id=tenant AND invoice_status<>'Cancelled')
     OR EXISTS(SELECT 1 FROM deurs WHERE rental_id=rental.id AND company_id=tenant AND (billing_locked OR status='Billed')) THEN
    RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_EVIDENCE_EXISTS','message','Financial evidence prevents return recovery.','retryable',false,'refreshRequired',false);
  END IF;
  IF EXISTS(
    SELECT 1 FROM rental_equipment_lines target
    JOIN rental_equipment_lines other_line ON other_line.equipment_id=target.equipment_id AND other_line.rental_id<>rental.id
    JOIN rentals other_rental ON other_rental.id=other_line.rental_id AND other_rental.company_id=tenant
    WHERE target.rental_id=rental.id AND other_rental.status IN('Draft','Assigned','Reserved','Released','Active')
  ) THEN RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_EVIDENCE_EXISTS','message','Equipment is required by another active Rental.','retryable',false,'refreshRequired',false); END IF;
  prior_version=rental.row_version;
  UPDATE rentals SET status='Active',returned_at=NULL,updated_by=actor::text WHERE id=rental.id RETURNING * INTO rental;
  FOR line IN SELECT * FROM rental_equipment_lines WHERE rental_id=rental.id ORDER BY equipment_id LOOP
    UPDATE rental_equipment_lines SET status='Active',updated_by=actor::text WHERE id=line.id;
    UPDATE assignments SET status='Active',returned_date=NULL WHERE id=line.assignment_id AND company_id=tenant AND status='Completed';
    UPDATE equipment SET status_id=coalesce((SELECT id FROM equipment_statuses WHERE lower(code)='rented' LIMIT 1),status_id),
      project_id=rental.project_id,operator_id=line.operator_id,updated_by=actor::text WHERE id=line.equipment_id AND company_id=tenant;
  END LOOP;
  recovery=record_recovery_compensation(tenant,'RENTAL_RETURN',rental.id,command->>'originalReference','REVERSE_RETURN',command->>'reason',actor,
    command->>'commandId',command->>'idempotencyKey',jsonb_build_object('status','Returned'),jsonb_build_object('status','Active'),prior_version,rental.row_version);
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'RENTAL',rental.id,'RETURN_REVERSED',actor::text,now_at,command->>'commandId',
    jsonb_build_object('status','Returned'),jsonb_build_object('status','Active','version',rental.row_version),jsonb_build_object('recoveryId',recovery.id,'reason',command->>'reason'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(rental.id),
    'value',jsonb_build_object('recoveryId',recovery.id,'targetId',rental.id,'action','REVERSE_RETURN','status','Active','version',rental.row_version));
  RETURN finish_operational_command(command,'REVERSE_RENTAL_RETURN','RENTAL',rental.id,tenant,actor::text,payload_hash,response,rental.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Rental return recovery already exists.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Rental return recovery could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_void_billing_statement(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor uuid=auth.uid(); statement billing_statements; recovery recovery_compensations;
  idem jsonb; payload_hash text; response jsonb; prior_version bigint; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=actor AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing update permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF length(btrim(coalesce(command->>'reason',''))) < 10 OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A meaningful recovery reason is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing statement is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'VOID_BILLING_STATEMENT','BILLING_STATEMENT',statement.id,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF statement.row_version<>coalesce((command->>'expectedVersion')::bigint,statement.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Billing statement version is stale.','retryable',false,'refreshRequired',true,'currentVersion',statement.row_version); END IF;
  IF statement.invoice_status='Cancelled' THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Billing statement is already voided or cancelled.','retryable',false,'refreshRequired',false); END IF;
  IF statement.invoice_status<>'Not Invoiced' OR EXISTS(SELECT 1 FROM collections WHERE billing_statement_id=statement.id) THEN
    RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_EVIDENCE_EXISTS','message','Invoice or collection evidence prevents statement voiding.','retryable',false,'refreshRequired',false);
  END IF;
  prior_version=statement.row_version;
  UPDATE billing_statements SET invoice_status='Cancelled',updated_by=actor::text WHERE id=statement.id RETURNING * INTO statement;
  recovery=record_recovery_compensation(tenant,'BILLING_STATEMENT',statement.id,command->>'originalReference','VOID',command->>'reason',actor,
    command->>'commandId',command->>'idempotencyKey',jsonb_build_object('invoiceStatus','Not Invoiced'),jsonb_build_object('invoiceStatus','Cancelled'),prior_version,statement.row_version);
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'BILLING_STATEMENT',statement.id,'VOID_COMPENSATION',actor::text,now_at,command->>'commandId',
    jsonb_build_object('invoiceStatus','Not Invoiced'),jsonb_build_object('invoiceStatus','Cancelled','version',statement.row_version),jsonb_build_object('recoveryId',recovery.id,'reason',command->>'reason'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,statement.rental_id),
    'value',jsonb_build_object('recoveryId',recovery.id,'targetId',statement.id,'action','VOID','status','Cancelled','version',statement.row_version));
  RETURN finish_operational_command(command,'VOID_BILLING_STATEMENT','BILLING_STATEMENT',statement.id,tenant,actor::text,payload_hash,response,statement.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Billing statement recovery already exists.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Billing statement could not be voided.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_cancel_invoice(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor uuid=auth.uid(); statement billing_statements; recovery recovery_compensations;
  idem jsonb; payload_hash text; response jsonb; prior_version bigint; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=actor AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing update permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF length(btrim(coalesce(command->>'reason',''))) < 10 OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A meaningful recovery reason is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Invoice is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'CANCEL_INVOICE','BILLING_STATEMENT',statement.id,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF statement.row_version<>coalesce((command->>'expectedVersion')::bigint,statement.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Invoice version is stale.','retryable',false,'refreshRequired',true,'currentVersion',statement.row_version); END IF;
  IF statement.invoice_status='Cancelled' THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Invoice is already cancelled.','retryable',false,'refreshRequired',false); END IF;
  IF statement.invoice_status<>'Invoiced' OR EXISTS(SELECT 1 FROM collections WHERE billing_statement_id=statement.id) THEN
    RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_EVIDENCE_EXISTS','message','Collected or incompatible Invoice state prevents cancellation.','retryable',false,'refreshRequired',false);
  END IF;
  prior_version=statement.row_version;
  UPDATE billing_statements SET invoice_status='Cancelled',updated_by=actor::text WHERE id=statement.id RETURNING * INTO statement;
  recovery=record_recovery_compensation(tenant,'INVOICE',statement.id,command->>'originalReference','CANCEL',command->>'reason',actor,
    command->>'commandId',command->>'idempotencyKey',jsonb_build_object('invoiceStatus','Invoiced'),jsonb_build_object('invoiceStatus','Cancelled'),prior_version,statement.row_version);
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'INVOICE',statement.id,'INVOICE_CANCELLED',actor::text,now_at,command->>'commandId',
    jsonb_build_object('invoiceStatus','Invoiced'),jsonb_build_object('invoiceStatus','Cancelled','version',statement.row_version),jsonb_build_object('recoveryId',recovery.id,'reason',command->>'reason'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,statement.rental_id),
    'value',jsonb_build_object('recoveryId',recovery.id,'targetId',statement.id,'action','CANCEL','status','Cancelled','version',statement.row_version));
  RETURN finish_operational_command(command,'CANCEL_INVOICE','BILLING_STATEMENT',statement.id,tenant,actor::text,payload_hash,response,statement.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','Invoice recovery already exists.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Invoice could not be cancelled.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_release_deur_consumption(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor uuid=auth.uid(); statement billing_statements; source deurs; line billing_statement_lines; recovery recovery_compensations;
  idem jsonb; payload_hash text; response jsonb; prior_version bigint; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=actor AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing update permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF length(btrim(coalesce(command->>'reason',''))) < 10 OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A meaningful recovery reason is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO source FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO line FROM billing_statement_lines WHERE billing_statement_id=statement.id AND deur_id=source.id AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL OR source.id IS NULL OR line.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing consumption is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'RELEASE_DEUR_CONSUMPTION','DEUR',source.id,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF source.row_version<>coalesce((command->>'expectedVersion')::bigint,source.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','DEUR version is stale.','retryable',false,'refreshRequired',true,'currentVersion',source.row_version); END IF;
  IF line.consumption_released_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','DEUR consumption is already released.','retryable',false,'refreshRequired',false); END IF;
  IF statement.invoice_status<>'Cancelled' OR NOT source.billing_locked OR source.billing_statement_id<>statement.id
     OR EXISTS(SELECT 1 FROM billing_statement_lines other WHERE other.deur_id=source.id AND other.id<>line.id AND other.consumption_released_at IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','RECOVERY_NOT_ALLOWED','message','DEUR consumption cannot be released safely.','retryable',false,'refreshRequired',false);
  END IF;
  prior_version=source.row_version;
  recovery=record_recovery_compensation(tenant,'DEUR_CONSUMPTION',source.id,coalesce(command->>'originalReference',statement.id),'RELEASE',command->>'reason',actor,
    command->>'commandId',command->>'idempotencyKey',jsonb_build_object('billingLocked',true,'statementId',statement.id),jsonb_build_object('billingLocked',false),prior_version,prior_version+1);
  PERFORM set_config('erp.deur_consumption_release','on',true);
  UPDATE billing_statement_lines SET consumption_released_at=now_at,consumption_released_by=actor,consumption_recovery_id=recovery.id WHERE id=line.id;
  UPDATE deurs SET billing_locked=false,billing_statement_id=NULL,status='Acknowledged',updated_by=actor::text WHERE id=source.id RETURNING * INTO source;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',source.id,'BILLING_CONSUMPTION_RELEASED',actor::text,now_at,command->>'commandId',
    jsonb_build_object('billingLocked',true,'statementId',statement.id),jsonb_build_object('billingLocked',false,'version',source.row_version),jsonb_build_object('recoveryId',recovery.id,'reason',command->>'reason'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,source.id,source.rental_id),
    'value',jsonb_build_object('recoveryId',recovery.id,'targetId',source.id,'action','RELEASE','status','Acknowledged','version',source.row_version));
  RETURN finish_operational_command(command,'RELEASE_DEUR_CONSUMPTION','DEUR',source.id,tenant,actor::text,payload_hash,response,source.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','ALREADY_REVERSED','message','DEUR consumption recovery already exists.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','DEUR consumption could not be released.','retryable',false,'refreshRequired',true);
END $$;

REVOKE ALL ON FUNCTION record_recovery_compensation(text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,bigint,bigint)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION command_reopen_rental(jsonb),command_reverse_rental_return(jsonb),command_void_billing_statement(jsonb),
  command_release_deur_consumption(jsonb),command_cancel_invoice(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_reopen_rental(jsonb),command_reverse_rental_return(jsonb),command_void_billing_statement(jsonb),
  command_release_deur_consumption(jsonb),command_cancel_invoice(jsonb) TO authenticated;

COMMIT;
