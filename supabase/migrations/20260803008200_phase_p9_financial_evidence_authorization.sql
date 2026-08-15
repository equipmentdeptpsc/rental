BEGIN;
SET search_path TO erp, auth, pg_catalog;

-- Financial evidence is never part of an Operator's owned-work projection.
-- A non-Operator caller must also hold an existing, explicit read permission.
DROP POLICY IF EXISTS tenant_read ON erp.billing_statements;
CREATE POLICY permission_aware_financial_read
ON erp.billing_statements
FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['billing.read', 'collections.read']
  )
);

DROP POLICY IF EXISTS tenant_read ON erp.billing_statement_lines;
CREATE POLICY permission_aware_financial_read
ON erp.billing_statement_lines
FOR SELECT TO authenticated
USING (
  erp.can_read_company_row(company_id)
  AND erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['billing.read', 'collections.read']
  )
  AND EXISTS (
    SELECT 1
    FROM erp.billing_statements statement
    WHERE statement.id = billing_statement_lines.billing_statement_id
      AND statement.company_id = billing_statement_lines.company_id
  )
);

ALTER TABLE erp.commercial_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p9_authenticated_tenant_read_commercial_snapshots
ON erp.commercial_snapshots;
CREATE POLICY permission_aware_commercial_evidence_read
ON erp.commercial_snapshots
FOR SELECT TO authenticated
USING (
  erp.current_linked_operator_id() IS NULL
  AND erp.current_user_has_any_read_permission(
    ARRAY['rental.commercialTerms.read', 'billing.read', 'collections.read']
  )
  AND EXISTS (
    SELECT 1
    FROM erp.rentals rental
    WHERE rental.id = commercial_snapshots.rental_id
      AND erp.can_read_company_row(rental.company_id)
  )
);

COMMENT ON POLICY permission_aware_financial_read ON erp.billing_statements IS
  'Active same-tenant non-Operator users require billing.read or collections.read.';
COMMENT ON POLICY permission_aware_financial_read ON erp.billing_statement_lines IS
  'Financial lines require authorized parent-statement access; linked Operators fail closed.';
COMMENT ON POLICY permission_aware_commercial_evidence_read ON erp.commercial_snapshots IS
  'Commercial evidence requires explicit read authority; linked Operators receive no rows.';

COMMIT;
