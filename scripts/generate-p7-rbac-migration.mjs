import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const roles = JSON.parse(fs.readFileSync(new URL('docs/rbac/canonical-roles.json', root)));
const permissions = JSON.parse(fs.readFileSync(new URL('docs/rbac/canonical-permissions.json', root)));
const matrix = JSON.parse(fs.readFileSync(new URL('docs/rbac/role-permission-matrix.json', root)));
const version = roles.version;

if (permissions.version !== version || matrix.version !== version) throw new Error('catalog version mismatch');

const standard = permissions.standardCatalog.resources.flatMap(resource =>
  permissions.standardCatalog.actions.map(({ action, riskClass, description }) => ({
    code: `${resource}.${action}`, resource, action, riskClass, description, active: true,
    deprecated: false, replacementCodes: [],
  })),
);
const workflow = permissions.workflowPermissions.map(x => ({ ...x, deprecated: false, replacementCodes: [] }));
const deprecated = permissions.deprecatedLegacyPermissions.map(x => ({
  ...x, deprecated: true,
}));
const allPermissions = [...standard, ...workflow, ...deprecated];
const activeCodes = [...standard, ...workflow].map(x => x.code);

const mappings = [];
for (const [roleCode, grant] of Object.entries(matrix.grants)) {
  const codes = grant.allPermissions
    ? activeCodes
    : [
        ...Object.entries(grant.standard).flatMap(([resource, actions]) => actions.map(action => `${resource}.${action}`)),
        ...grant.workflow,
      ];
  for (const permissionCode of codes) mappings.push({ roleCode, permissionCode });
}

const q = value => JSON.stringify(value).replaceAll("'", "''");
const json = value => `'${q(value)}'::jsonb`;

const sql = `BEGIN;
SET LOCAL search_path = erp, pg_catalog;

-- Catalog-only migration. The effective authority tables role_permissions and
-- user_roles are intentionally snapshotted and never written by this migration.
CREATE TEMP TABLE p7_authority_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM erp.user_roles) AS user_role_count,
  (SELECT md5(coalesce(string_agg(user_id::text || ':' || role_id, ',' ORDER BY user_id::text, role_id), '')) FROM erp.user_roles) AS user_role_hash,
  (SELECT count(*) FROM erp.role_permissions) AS role_permission_count,
  (SELECT md5(coalesce(string_agg(role_id || ':' || permission_id, ',' ORDER BY role_id, permission_id), '')) FROM erp.role_permissions) AS role_permission_hash;

ALTER TABLE erp.app_roles ADD COLUMN IF NOT EXISTS catalog_version text;
ALTER TABLE erp.app_roles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE erp.app_roles ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;

ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS resource text;
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS catalog_version text;
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS deprecated_at timestamptz;
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS replacement_permission text[];
ALTER TABLE erp.app_permissions ADD COLUMN IF NOT EXISTS risk_class text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_permissions_resource_action
  ON erp.app_permissions(resource, action)
  WHERE resource IS NOT NULL AND action IS NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'erp.app_permissions'::regclass
      AND conname = 'ck_app_permissions_risk_class'
  ) THEN
    ALTER TABLE erp.app_permissions
      ADD CONSTRAINT ck_app_permissions_risk_class
      CHECK (risk_class IS NULL OR risk_class IN ('READ', 'WRITE', 'DESTRUCTIVE', 'APPROVAL', 'TERMINAL', 'EXPORT', 'ADMINISTRATIVE'));
  END IF;
END
$constraints$;

CREATE TABLE IF NOT EXISTS erp.permission_compatibility_aliases (
  legacy_permission_code text NOT NULL,
  target_permission_code text NOT NULL REFERENCES erp.app_permissions(code),
  catalog_version text NOT NULL,
  mode text NOT NULL CHECK (mode = 'migration-only'),
  PRIMARY KEY (legacy_permission_code, target_permission_code, catalog_version)
);

CREATE TABLE IF NOT EXISTS erp.canonical_role_permission_catalog (
  role_code text NOT NULL REFERENCES erp.app_roles(code),
  permission_code text NOT NULL REFERENCES erp.app_permissions(code),
  catalog_version text NOT NULL,
  PRIMARY KEY (role_code, permission_code, catalog_version)
);

WITH source AS (
  SELECT * FROM jsonb_to_recordset(${json(roles.roles)}) AS x(
    code text, name text, description text, "systemManaged" boolean, active boolean
  )
)
INSERT INTO erp.app_roles(id, code, name, catalog_version, active, deprecated_at)
SELECT 'ROLE-P7-' || upper(substr(md5(code), 1, 24)), code, name, '${version}', active, NULL
FROM source ORDER BY code
ON CONFLICT (code) DO UPDATE SET
  catalog_version = EXCLUDED.catalog_version,
  active = EXCLUDED.active,
  deprecated_at = NULL;

WITH source AS (
  SELECT * FROM jsonb_to_recordset(${json(allPermissions)}) AS x(
    code text, resource text, action text, "riskClass" text, description text,
    active boolean, deprecated boolean, "replacementCodes" jsonb
  )
)
INSERT INTO erp.app_permissions(
  id, code, name, resource, action, catalog_version, active,
  deprecated_at, replacement_permission, risk_class
)
SELECT
  'PERM-P7-' || upper(substr(md5(code), 1, 24)), code, description,
  resource, action, '${version}', active,
  CASE WHEN deprecated THEN timestamptz '2026-08-13 00:00:00+00' ELSE NULL END,
  ARRAY(SELECT jsonb_array_elements_text("replacementCodes")), "riskClass"
FROM source ORDER BY code
ON CONFLICT (code) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  catalog_version = EXCLUDED.catalog_version,
  active = EXCLUDED.active,
  deprecated_at = EXCLUDED.deprecated_at,
  replacement_permission = EXCLUDED.replacement_permission,
  risk_class = EXCLUDED.risk_class;

DELETE FROM erp.permission_compatibility_aliases WHERE catalog_version = '${version}';
WITH source AS (
  SELECT * FROM jsonb_to_recordset(${json(permissions.compatibilityAliases)}) AS x(
    "legacyCode" text, "expandsTo" jsonb, mode text
  )
)
INSERT INTO erp.permission_compatibility_aliases(
  legacy_permission_code, target_permission_code, catalog_version, mode
)
SELECT source."legacyCode", expanded.target_permission_code, '${version}', source.mode
FROM source
CROSS JOIN LATERAL jsonb_array_elements_text(source."expandsTo")
  AS expanded(target_permission_code)
ORDER BY source."legacyCode", expanded.target_permission_code;

DELETE FROM erp.canonical_role_permission_catalog WHERE catalog_version = '${version}';
WITH source AS (
  SELECT * FROM jsonb_to_recordset(${json(mappings)}) AS x("roleCode" text, "permissionCode" text)
)
INSERT INTO erp.canonical_role_permission_catalog(role_code, permission_code, catalog_version)
SELECT "roleCode", "permissionCode", '${version}' FROM source
ORDER BY "roleCode", "permissionCode";

DO $validation$
DECLARE
  baseline p7_authority_baseline%ROWTYPE;
BEGIN
  SELECT * INTO baseline FROM p7_authority_baseline;

  IF (SELECT count(*) FROM erp.app_roles WHERE catalog_version = '${version}') <> ${roles.roles.length} THEN
    RAISE EXCEPTION 'P7 role catalog count mismatch';
  END IF;
  IF (SELECT count(*) FROM erp.app_permissions WHERE catalog_version = '${version}') <> ${allPermissions.length} THEN
    RAISE EXCEPTION 'P7 permission catalog count mismatch';
  END IF;
  IF (SELECT count(*) FROM erp.app_permissions WHERE catalog_version = '${version}' AND deprecated_at IS NULL) <> ${activeCodes.length} THEN
    RAISE EXCEPTION 'P7 active permission count mismatch';
  END IF;
  IF (SELECT count(*) FROM erp.permission_compatibility_aliases WHERE catalog_version = '${version}') <> ${permissions.compatibilityAliases.reduce((n, x) => n + x.expandsTo.length, 0)} THEN
    RAISE EXCEPTION 'P7 compatibility alias count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.permission_compatibility_aliases a
    LEFT JOIN erp.app_permissions p ON p.code = a.target_permission_code
    WHERE a.catalog_version = '${version}' AND (p.code IS NULL OR p.active IS NOT TRUE OR p.deprecated_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'P7 compatibility alias target is missing or inactive';
  END IF;
  IF (SELECT count(*) FROM erp.canonical_role_permission_catalog WHERE catalog_version = '${version}') <> ${mappings.length} THEN
    RAISE EXCEPTION 'P7 canonical matrix count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.canonical_role_permission_catalog m
    LEFT JOIN erp.app_roles r ON r.code = m.role_code
    LEFT JOIN erp.app_permissions p ON p.code = m.permission_code
    WHERE m.catalog_version = '${version}'
      AND (r.catalog_version IS DISTINCT FROM '${version}' OR p.catalog_version IS DISTINCT FROM '${version}' OR p.deprecated_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'P7 canonical matrix reference/version mismatch';
  END IF;
  IF EXISTS (
    SELECT resource, action FROM erp.app_permissions
    WHERE catalog_version = '${version}'
    GROUP BY resource, action HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'P7 resource/action uniqueness mismatch';
  END IF;
  IF (SELECT count(*) FROM erp.user_roles) IS DISTINCT FROM baseline.user_role_count
     OR (SELECT md5(coalesce(string_agg(user_id::text || ':' || role_id, ',' ORDER BY user_id::text, role_id), '')) FROM erp.user_roles) IS DISTINCT FROM baseline.user_role_hash
     OR (SELECT count(*) FROM erp.role_permissions) IS DISTINCT FROM baseline.role_permission_count
     OR (SELECT md5(coalesce(string_agg(role_id || ':' || permission_id, ',' ORDER BY role_id, permission_id), '')) FROM erp.role_permissions) IS DISTINCT FROM baseline.role_permission_hash THEN
    RAISE EXCEPTION 'P7 migration changed effective role or permission assignments';
  END IF;
END
$validation$;

COMMENT ON TABLE erp.canonical_role_permission_catalog IS
  'Inert canonical RBAC design matrix. It is not read by effective_user_permissions and grants no runtime authority.';
COMMENT ON TABLE erp.permission_compatibility_aliases IS
  'Migration-only compatibility metadata. Alias expansion is not part of runtime authority evaluation.';

COMMIT;
`;

if (process.argv[2]) fs.writeFileSync(process.argv[2], sql);
else process.stdout.write(sql);
