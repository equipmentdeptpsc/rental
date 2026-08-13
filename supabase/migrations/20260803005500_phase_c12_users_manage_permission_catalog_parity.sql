BEGIN;
SET search_path = erp, pg_catalog;

DO $$
DECLARE existing_role erp.app_roles;
BEGIN
  SELECT * INTO existing_role FROM erp.app_roles
  WHERE id = 'ROLE-CANON-SYSTEM-ADMINISTRATOR'
     OR code = 'system-administrator';
  IF existing_role.id IS NOT NULL AND (
    existing_role.id IS DISTINCT FROM 'ROLE-CANON-SYSTEM-ADMINISTRATOR'
    OR existing_role.code IS DISTINCT FROM 'system-administrator'
    OR existing_role.name IS DISTINCT FROM 'System Administrator'
  ) THEN
    RAISE EXCEPTION 'canonical System Administrator role identity conflicts with the frozen application catalog'
      USING ERRCODE = '23505';
  END IF;
  INSERT INTO erp.app_roles(id, code, name)
  VALUES('ROLE-CANON-SYSTEM-ADMINISTRATOR', 'system-administrator', 'System Administrator')
  ON CONFLICT (id) DO NOTHING;
END $$;

DO $$
DECLARE existing_permission erp.app_permissions;
BEGIN
  SELECT * INTO existing_permission FROM erp.app_permissions
  WHERE id = 'PERM-CANON-USERS-MANAGE'
     OR code = 'users.manage';
  IF existing_permission.id IS NOT NULL AND (
    existing_permission.id IS DISTINCT FROM 'PERM-CANON-USERS-MANAGE'
    OR existing_permission.code IS DISTINCT FROM 'users.manage'
    OR existing_permission.name IS DISTINCT FROM 'Manage Users'
  ) THEN
    RAISE EXCEPTION 'canonical users.manage permission identity conflicts with the frozen application catalog'
      USING ERRCODE = '23505';
  END IF;
  INSERT INTO erp.app_permissions(id, code, name)
  VALUES('PERM-CANON-USERS-MANAGE', 'users.manage', 'Manage Users')
  ON CONFLICT (id) DO NOTHING;
END $$;

INSERT INTO erp.role_permissions(role_id, permission_id)
VALUES('ROLE-CANON-SYSTEM-ADMINISTRATOR', 'PERM-CANON-USERS-MANAGE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

DO $$
DECLARE mapped_roles text[];
BEGIN
  IF (SELECT count(*) FROM erp.app_permissions WHERE code = 'users.manage') <> 1 THEN
    RAISE EXCEPTION 'users.manage permission cardinality differs from the frozen application catalog'
      USING ERRCODE = '55000';
  END IF;
  SELECT array_agg(role.code ORDER BY role.code) INTO mapped_roles
  FROM erp.role_permissions mapping
  JOIN erp.app_roles role ON role.id = mapping.role_id
  JOIN erp.app_permissions permission ON permission.id = mapping.permission_id
  WHERE permission.code = 'users.manage';
  IF mapped_roles IS DISTINCT FROM ARRAY['system-administrator']::text[] THEN
    RAISE EXCEPTION 'users.manage role mappings differ from the frozen application catalog'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.role_permissions mapping
    JOIN erp.app_roles role ON role.id = mapping.role_id
    WHERE role.code = 'rental-operations'
      AND mapping.permission_id = 'PERM-CANON-USERS-MANAGE'
  ) THEN
    RAISE EXCEPTION 'rental-operations must not receive users.manage'
      USING ERRCODE = '55000';
  END IF;
END $$;

COMMIT;
