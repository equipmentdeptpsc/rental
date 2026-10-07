BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Browser billing reads need the same database-owned logical projection as
-- server-side validation. Keep the underlying security-definer projection
-- private and expose only a tenant-checked wrapper to authenticated callers.
CREATE OR REPLACE FUNCTION erp.read_effective_deur_event_order(target_deur_id text)
RETURNS TABLE(event_id text, deur_id text, physical_sequence integer, logical_sequence integer, lineage_root_event_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT event_order.event_id, event_order.deur_id, event_order.physical_sequence,
    event_order.logical_sequence, event_order.lineage_root_event_id
  FROM erp.deurs target
  CROSS JOIN LATERAL erp.effective_deur_event_order(target.id) event_order
  WHERE target.id=target_deur_id
    AND erp.can_read_company_row(target.company_id)
  ORDER BY event_order.logical_sequence, event_order.event_id;
$$;

REVOKE ALL ON FUNCTION erp.read_effective_deur_event_order(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_effective_deur_event_order(text) TO authenticated;

COMMENT ON FUNCTION erp.read_effective_deur_event_order(text) IS
  'Tenant-checked authenticated read boundary for the canonical effective DEUR logical event order.';

COMMIT;
