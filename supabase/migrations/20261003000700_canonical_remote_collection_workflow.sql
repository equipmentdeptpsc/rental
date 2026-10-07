BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- Collections are the current one-invoice customer remittance model.  A
-- separate Payment aggregate remains out of scope until cross-invoice
-- allocation or unapplied cash is required.
ALTER TABLE erp.collections
  ADD COLUMN IF NOT EXISTS company_id text REFERENCES erp.companies(id),
  ADD COLUMN IF NOT EXISTS rental_id text REFERENCES erp.rentals(id);

UPDATE erp.collections collection_row
SET company_id = statement.company_id
FROM erp.billing_statements statement
WHERE statement.id = collection_row.billing_statement_id
  AND collection_row.company_id IS NULL;

UPDATE erp.collections collection_row
SET rental_id = statement.rental_id
FROM erp.billing_statements statement
WHERE statement.id = collection_row.billing_statement_id
  AND collection_row.rental_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_collections_company_statement
  ON erp.collections(company_id, billing_statement_id);

CREATE INDEX IF NOT EXISTS ix_collections_company_rental
  ON erp.collections(company_id, rental_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_company_statement_reference
  ON erp.collections(company_id, billing_statement_id, lower(reference_no))
  WHERE reference_no IS NOT NULL;

ALTER TABLE erp.collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON erp.collections;
CREATE POLICY tenant_read ON erp.collections
  FOR SELECT TO authenticated
  USING (company_id = erp.current_company_id());

REVOKE INSERT, UPDATE, DELETE ON erp.collections FROM anon, authenticated;

CREATE OR REPLACE FUNCTION erp.command_record_collection(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  statement_row erp.billing_statements%ROWTYPE;
  collection_row erp.collections%ROWTYPE;
  idem jsonb;
  payload_hash text;
  amount_value numeric;
  collected_total numeric;
  outstanding numeric;
  next_status erp.invoice_status;
  reference_value text = nullif(btrim(command->>'reference'), '');
  payment_date_value date;
  now_at timestamptz = clock_timestamp();
  response jsonb;
BEGIN
  IF tenant IS NULL OR actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Authentication is required.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF NOT erp.current_user_has_permission('collections.create') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Collection creation permission is required.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF nullif(command->>'statementId', '') IS NULL
     OR nullif(command->>'amount', '') IS NULL
     OR nullif(command->>'paymentDate', '') IS NULL
     OR reference_value IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Statement, amount, payment date, and reference are required.', 'retryable', false, 'refreshRequired', false);
  END IF;

  BEGIN
    amount_value = (command->>'amount')::numeric;
    payment_date_value = (command->>'paymentDate')::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Amount and payment date are invalid.', 'retryable', false, 'refreshRequired', false);
  END;
  IF amount_value IS NULL OR amount_value <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Collection amount must be greater than zero.', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT * INTO statement_row
  FROM erp.billing_statements
  WHERE id = command->>'statementId' AND company_id = tenant
  FOR UPDATE;
  IF statement_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Billing statement is unavailable.', 'retryable', false, 'refreshRequired', false);
  END IF;

  idem = erp.begin_operational_command(command, 'RECORD_COLLECTION', 'BILLING_STATEMENT', statement_row.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'An idempotency key is required.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF idem->>'state' = 'MISMATCH' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF idem->>'state' = 'REPLAY' THEN
    RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED');
  END IF;
  payload_hash = idem->>'payloadHash';

  IF statement_row.row_version <> coalesce((command->>'expectedVersion')::bigint, statement_row.row_version) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Collection version is stale.', 'retryable', false, 'refreshRequired', true, 'currentVersion', statement_row.row_version);
  END IF;
  IF statement_row.invoice_status NOT IN ('Invoiced', 'Partially Collected') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only an invoiced statement with an outstanding balance can receive a collection.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.collections existing
    WHERE existing.company_id = tenant
      AND existing.billing_statement_id = statement_row.id
      AND lower(existing.reference_no) = lower(reference_value)
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'This collection reference was already recorded for the statement.', 'retryable', false, 'refreshRequired', true);
  END IF;

  SELECT coalesce(sum(existing.amount), 0)
  INTO collected_total
  FROM erp.collections existing
  WHERE existing.company_id = tenant AND existing.billing_statement_id = statement_row.id;
  outstanding = greatest(coalesce(statement_row.grand_total, statement_row.subtotal) - collected_total, 0);
  IF outstanding <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'This invoice has no outstanding balance.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF amount_value > outstanding THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Collection amount cannot exceed the outstanding balance.', 'retryable', false, 'refreshRequired', false);
  END IF;

  INSERT INTO erp.collections(
    id, company_id, billing_statement_id, rental_id, amount, currency, reference_no,
    collected_at, created_by
  ) VALUES (
    extensions.gen_random_uuid()::text, tenant, statement_row.id, statement_row.rental_id, amount_value,
    statement_row.currency, reference_value, payment_date_value, actor
  ) RETURNING * INTO collection_row;

  collected_total = collected_total + amount_value;
  outstanding = greatest(coalesce(statement_row.grand_total, statement_row.subtotal) - collected_total, 0);
  next_status = CASE
    WHEN outstanding = 0 THEN 'Fully Collected'::erp.invoice_status
    ELSE 'Partially Collected'::erp.invoice_status
  END;

  UPDATE erp.billing_statements
  SET invoice_status = next_status, updated_by = actor
  WHERE id = statement_row.id
  RETURNING * INTO statement_row;

  INSERT INTO erp.audit_log(
    id, company_id, aggregate_type, aggregate_id, action, actor_id,
    occurred_at, correlation_id, previous_values, new_values, metadata
  ) VALUES (
    extensions.gen_random_uuid()::text, tenant, 'BillingStatement', statement_row.id,
    'RECORD_COLLECTION', actor, now_at, command->>'commandId',
    jsonb_build_object('invoiceStatus', CASE WHEN next_status = 'Fully Collected' THEN 'Partially Collected' ELSE 'Invoiced' END),
    jsonb_build_object('invoiceStatus', next_status, 'collectedTotal', collected_total, 'outstandingBalance', outstanding, 'version', statement_row.row_version),
    jsonb_build_object('collectionId', collection_row.id, 'amount', amount_value)
  );

  response = jsonb_build_object(
    'success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at,
    'refresh', jsonb_build_array(statement_row.id, statement_row.rental_id),
    'value', jsonb_build_object(
      'collectionId', collection_row.id, 'statementId', statement_row.id,
      'invoiceStatus', statement_row.invoice_status, 'collectedTotal', collected_total,
      'outstandingBalance', outstanding, 'version', statement_row.row_version
    )
  );
  RETURN erp.finish_operational_command(command, 'RECORD_COLLECTION', 'BILLING_STATEMENT', statement_row.id, tenant, actor, payload_hash, response, statement_row.row_version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'This collection reference was already recorded for the statement.', 'retryable', false, 'refreshRequired', true);
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'message', 'Collection could not be recorded.', 'retryable', false, 'refreshRequired', true);
END;
$$;

ALTER FUNCTION erp.command_record_collection(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_record_collection(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.command_record_collection(jsonb) TO authenticated;

COMMIT;
