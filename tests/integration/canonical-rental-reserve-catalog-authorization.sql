\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE definition text=pg_get_functiondef('erp.command_reserve_rental(jsonb)'::regprocedure);
BEGIN
 IF definition NOT LIKE '%current_user_has_permission(''rental.update'')%' OR definition LIKE '%current_user_has_permission(''rental.manage'')%' THEN
  RAISE EXCEPTION 'Reserve RPC is not aligned to rental.update';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='rental.update') THEN
  RAISE EXCEPTION 'System Administrator must retain rental.update';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='dispatcher' AND p.code='rental.update') THEN
  RAISE EXCEPTION 'Dispatcher must have rental.update';
 END IF;
 IF EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code IN('operations-manager','equipment-coordinator','billing-staff','finance') AND p.code='rental.update') THEN
  RAISE EXCEPTION 'Reserve authority was broadened beyond the Catalog 2.0 matrix';
 END IF;
 IF EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code IN('system-administrator','operations-manager','dispatcher','equipment-coordinator','billing-staff') AND p.code='rental.manage') THEN
  RAISE EXCEPTION 'Deprecated rental.manage was restored to a canonical role';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.app_permissions WHERE code='rental.manage' AND active AND deprecated_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Legacy rental.manage compatibility metadata changed';
 END IF;
END $$;

ROLLBACK;
