$ErrorActionPreference = 'Stop'
$migration = Get-Content -LiteralPath 'supabase/migrations/20260825000700_catalog_2_user_list_visibility.sql' -Raw
$migration = $migration -replace '(?m)^BEGIN;\r?\n', '' -replace '(?m)^COMMIT;\r?\n?$', ''
$fixture = @'
BEGIN;
DROP FUNCTION erp.current_linked_operator_id() CASCADE;
DROP FUNCTION erp.current_user_has_any_read_permission(text[]) CASCADE;
DROP POLICY IF EXISTS catalog_2_authorization_administrator_read ON erp.app_roles;
DROP POLICY IF EXISTS catalog_2_authorization_administrator_read ON erp.app_permissions;
DROP POLICY IF EXISTS catalog_2_authorization_administrator_read ON erp.role_permissions;
CREATE POLICY roles_authenticated_read ON erp.app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_authenticated_read ON erp.app_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_authenticated_read ON erp.role_permissions FOR SELECT TO authenticated USING (true);
'@
$assertions = @'
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='erp' AND c.relname='app_roles' AND p.polname='roles_authenticated_read') THEN
    RAISE EXCEPTION 'historical app_roles policy was not preserved';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='erp' AND c.relname='app_roles' AND p.polname='catalog_2_authorization_administrator_read') THEN
    RAISE EXCEPTION 'P9-only app_roles policy was unexpectedly created';
  END IF;
END$$;
ROLLBACK;
'@
$sql = $fixture + "`n" + $migration + "`n" + $assertions
$sql | docker exec -i supabase_db_EquipmentRentalSystem_-_Codex psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw "Remote-like historical migration certification failed." }
