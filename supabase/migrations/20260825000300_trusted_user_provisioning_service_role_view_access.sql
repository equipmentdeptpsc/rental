BEGIN;
SET LOCAL search_path = erp, pg_catalog;

GRANT SELECT (active)
ON erp.app_permissions
TO service_role;

COMMIT;
