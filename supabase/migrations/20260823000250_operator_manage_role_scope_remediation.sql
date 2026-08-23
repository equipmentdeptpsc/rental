BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

DO $$
DECLARE
  operator_manage_permission_id text;
  system_administrator_role_id text;
BEGIN
  IF (SELECT count(*) FROM erp.app_permissions WHERE code='operator.manage') <> 1 THEN
    RAISE EXCEPTION 'operator.manage permission catalog invariant failed';
  END IF;
  IF (SELECT count(*) FROM erp.app_roles WHERE code='system-administrator') <> 1 THEN
    RAISE EXCEPTION 'system-administrator role catalog invariant failed';
  END IF;

  SELECT id INTO operator_manage_permission_id
  FROM erp.app_permissions
  WHERE code='operator.manage';
  SELECT id INTO system_administrator_role_id
  FROM erp.app_roles
  WHERE code='system-administrator';

  INSERT INTO erp.role_permissions(role_id,permission_id)
  VALUES(system_administrator_role_id,operator_manage_permission_id)
  ON CONFLICT(role_id,permission_id) DO NOTHING;

  DELETE FROM erp.role_permissions
  WHERE permission_id=operator_manage_permission_id
    AND role_id<>system_administrator_role_id;

  IF (SELECT count(*) FROM erp.role_permissions WHERE permission_id=operator_manage_permission_id AND role_id=system_administrator_role_id) <> 1 THEN
    RAISE EXCEPTION 'system-administrator operator.manage mapping invariant failed';
  END IF;
  IF EXISTS(SELECT 1 FROM erp.role_permissions WHERE permission_id=operator_manage_permission_id AND role_id<>system_administrator_role_id) THEN
    RAISE EXCEPTION 'non-system-administrator operator.manage mapping remains';
  END IF;
END $$;

COMMIT;
