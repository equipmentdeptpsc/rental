BEGIN;
SET search_path TO erp, auth;

CREATE FUNCTION can_read_company_row(target_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM users caller
      JOIN companies company
        ON company.id = caller.company_id
       AND company.active
      WHERE caller.id = auth.uid()
        AND caller.status = 'active'
        AND caller.company_id = target_company_id
    )
$$;

REVOKE EXECUTE ON FUNCTION can_read_company_row(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_read_company_row(text)
TO authenticated;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'assignments',
    'audit_log',
    'billing_statement_lines',
    'billing_statements',
    'customers',
    'deur_events',
    'deur_review_history',
    'deurs',
    'equipment',
    'number_sequences',
    'operators',
    'projects',
    'rental_equipment_lines',
    'rentals'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON erp.%I', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_read ON erp.%I FOR SELECT TO authenticated USING (erp.can_read_company_row(company_id))',
      target_table
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS recovery_compensations_tenant_read
ON recovery_compensations;
CREATE POLICY recovery_compensations_tenant_read
ON recovery_compensations
FOR SELECT
TO authenticated
USING (can_read_company_row(company_id));

COMMENT ON FUNCTION can_read_company_row(text) IS
  'Boolean-only RLS helper: active authenticated callers may read rows belonging to their one active company.';

COMMIT;
