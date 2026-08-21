BEGIN;
SET LOCAL search_path = erp, pg_catalog;

GRANT SELECT (id, company_id, status, operator_id) ON erp.users TO service_role;
GRANT SELECT (user_id, permission_code) ON erp.effective_user_permissions TO service_role;
GRANT SELECT (user_id, role_id) ON erp.user_roles TO service_role;
GRANT SELECT (id, code) ON erp.app_roles TO service_role;
GRANT SELECT (role_id, permission_id) ON erp.role_permissions TO service_role;
GRANT SELECT (id, code) ON erp.app_permissions TO service_role;
GRANT SELECT (id, company_id, status) ON erp.operators TO service_role;

REVOKE SELECT ON erp.user_provisioning_commands FROM service_role;

COMMIT;
