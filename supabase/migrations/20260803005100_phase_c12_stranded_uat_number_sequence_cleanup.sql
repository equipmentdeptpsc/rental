BEGIN;
SET search_path = erp, pg_catalog;

DO $$
DECLARE
  uat_sequence_count integer;
  manifest_count integer;
  deleted_count integer;
BEGIN
  IF (SELECT count(*) FROM erp.companies
      WHERE id = 'TENANT-LOCAL-001'
        AND code = 'LOCAL'
        AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C12 sequence cleanup rejected: protected local tenant invariant failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO uat_sequence_count
  FROM erp.number_sequences
  WHERE company_id LIKE 'TENANT-UAT-%';

  SELECT count(*) INTO manifest_count
  FROM erp.number_sequences sequence
  JOIN (VALUES
    ('TENANT-UAT-C4B2-BILLING','BILLING_STATEMENT',2026,'BS',30::bigint),
    ('TENANT-UAT-C4C-DEUR','DEUR',2026,'DEUR',13::bigint),
    ('TENANT-UAT-C4D-RACES','DEUR',2026,'DEUR',13::bigint),
    ('TENANT-UAT-C4E-FINANCIAL','BILLING_STATEMENT',2026,'BS',14::bigint)
  ) AS manifest(company_id,scope,sequence_year,prefix,current_value)
    ON sequence.company_id = manifest.company_id
   AND sequence.scope = manifest.scope
   AND sequence.sequence_year = manifest.sequence_year
   AND sequence.prefix = manifest.prefix
   AND sequence.current_value = manifest.current_value;

  IF uat_sequence_count NOT IN (0, 4)
     OR (uat_sequence_count = 4 AND manifest_count <> 4) THEN
    RAISE EXCEPTION 'C12 sequence cleanup rejected: exact four-row manifest mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF uat_sequence_count = 4 AND EXISTS (
    SELECT 1 FROM (VALUES
      ('TENANT-UAT-C4B2-BILLING'),
      ('TENANT-UAT-C4C-DEUR'),
      ('TENANT-UAT-C4D-RACES'),
      ('TENANT-UAT-C4E-FINANCIAL')
    ) AS target(company_id)
    WHERE EXISTS (SELECT 1 FROM erp.companies WHERE id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.users WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.user_roles role JOIN erp.users app_user ON app_user.id = role.user_id WHERE app_user.company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.operators WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.customers WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.projects WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.equipment WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.assignments WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.rentals WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.rental_equipment_lines WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.deurs WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.deur_events WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.customer_review_requests WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.customer_review_outcomes WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.manager_review_requests WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.manager_review_outcomes WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.notification_outbox WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.notification_delivery_attempts WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.billing_statements WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.billing_statement_lines WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.collections collection JOIN erp.billing_statements statement ON statement.id = collection.billing_statement_id WHERE statement.company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.operational_command_idempotency WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.deur_command_idempotency WHERE company_id = target.company_id)
       OR EXISTS (SELECT 1 FROM erp.audit_log WHERE company_id = target.company_id)
  ) THEN
    RAISE EXCEPTION 'C12 sequence cleanup rejected: parent or business fixture evidence exists'
      USING ERRCODE = '55000';
  END IF;

  deleted_count := 0;
  IF uat_sequence_count = 4 THEN
    DELETE FROM erp.number_sequences sequence
    USING (VALUES
      ('TENANT-UAT-C4B2-BILLING','BILLING_STATEMENT',2026,'BS',30::bigint),
      ('TENANT-UAT-C4C-DEUR','DEUR',2026,'DEUR',13::bigint),
      ('TENANT-UAT-C4D-RACES','DEUR',2026,'DEUR',13::bigint),
      ('TENANT-UAT-C4E-FINANCIAL','BILLING_STATEMENT',2026,'BS',14::bigint)
    ) AS manifest(company_id,scope,sequence_year,prefix,current_value)
    WHERE sequence.company_id = manifest.company_id
      AND sequence.scope = manifest.scope
      AND sequence.sequence_year = manifest.sequence_year
      AND sequence.prefix = manifest.prefix
      AND sequence.current_value = manifest.current_value;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  IF deleted_count <> uat_sequence_count
     OR EXISTS (SELECT 1 FROM erp.number_sequences WHERE company_id LIKE 'TENANT-UAT-%') THEN
    RAISE EXCEPTION 'C12 sequence cleanup rejected: exact post-delete verification failed'
      USING ERRCODE = '55000';
  END IF;

  IF (SELECT count(*) FROM erp.companies
      WHERE id = 'TENANT-LOCAL-001'
        AND code = 'LOCAL'
        AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C12 sequence cleanup rejected: protected local tenant postcondition failed'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

COMMIT;
