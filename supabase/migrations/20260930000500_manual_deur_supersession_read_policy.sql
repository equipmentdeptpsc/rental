BEGIN;

SET LOCAL search_path=erp,auth,pg_catalog;

-- current_company_id() is deliberately private to command boundaries.  The
-- supersession read policy must use the existing, authenticated-only RLS helper
-- instead of granting browser callers access to that private helper.
DROP POLICY IF EXISTS deur_event_supersessions_select_same_company
  ON erp.deur_event_supersessions;

CREATE POLICY deur_event_supersessions_select_same_company
  ON erp.deur_event_supersessions
  FOR SELECT TO authenticated
  USING (erp.can_read_company_row(company_id));

COMMIT;
