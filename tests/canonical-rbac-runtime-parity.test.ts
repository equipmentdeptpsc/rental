import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import roles from "../docs/rbac/canonical-roles.json";
import matrix from "../docs/rbac/role-permission-matrix.json";

const migration=readFileSync("supabase/migrations/20260825000100_canonical_rbac_catalog_2_runtime_parity.sql","utf8");
const usersPage=readFileSync("src/features/users/pages/UsersPage.tsx","utf8");
const rolesPage=readFileSync("src/features/administration/pages/RolesPage.tsx","utf8");
const remoteRolesPage=readFileSync("src/features/administration/pages/RemoteRolesPage.tsx","utf8");
const remoteRepository=readFileSync("src/integrations/supabase/SupabaseRemoteUserAdministration.ts","utf8");
const certification=readFileSync("tests/integration/canonical-rbac-runtime-parity.sql","utf8");
const legacyCertification=readFileSync("tests/integration/canonical-rbac-runtime-parity-legacy.sql","utf8");

function permissions(roleCode:keyof typeof matrix.grants){
  const grant=matrix.grants[roleCode];
  if("allPermissions" in grant&&grant.allPermissions)return "ALL";
  return [...Object.entries(grant.standard).flatMap(([resource,actions])=>actions.map(action=>`${resource}.${action}`)),...grant.workflow].sort();
}

describe("Catalog 2.0.0 runtime RBAC parity",()=>{
  it("creates every document-defined role without replacing role identities",()=>{
    expect(roles.version).toBe("2.0.0");
    expect(roles.roles).toHaveLength(9);
    for(const role of roles.roles)expect(migration).toContain(`\"code\":\"${role.code}\"`);
    expect(migration).toContain("ON CONFLICT(code) DO UPDATE");
    expect(migration).not.toMatch(/UPDATE\s+erp\.user_roles|DELETE\s+FROM\s+erp\.user_roles|INSERT\s+INTO\s+erp\.user_roles/i);
  });

  it("conditionally preserves legacy roles as active deprecated compatibility authorities",()=>{
    expect(roles.roles.some(role=>role.code==="rental-operations")).toBe(false);
    expect(roles.roles.some(role=>role.code==="finance")).toBe(false);
    expect(migration).toContain("WHERE code IN('finance','rental-operations')");
    expect(migration).toContain("catalog_version='legacy-compatibility',active=true");
    expect(usersPage).toContain("role.active&&!('deprecatedAt' in role&&role.deprecatedAt)");
    expect(certification).toContain("Clean Catalog 2.0 must not synthesize Rental Operations");
    expect(legacyCertification).toContain("Rental Operations must remain active deprecated compatibility");
    expect(legacyCertification).toContain("Legacy users must not be migrated to Operations Manager");
  });

  it("synchronizes Operations Manager to the exact 28-permission document mapping",()=>{
    const expected=permissions("operations-manager");
    expect(expected).not.toBe("ALL");
    expect(expected).toHaveLength(28);
    expect(expected).toContain("rental.approval.decide");
    for(const permissionCode of expected)expect(migration).toContain(`\"roleCode\":\"operations-manager\",\"permissionCode\":\"${permissionCode}\"`);
    expect(migration).toContain("operation_count<>28");
  });

  it("keeps Finance out of approval and preserves non-catalog administrator extensions",()=>{
    expect(permissions("billing-staff")).not.toContain("rental.approval.decide");
    expect(migration).toContain("role.code='finance' AND permission.code='rental.approval.decide'");
    expect(migration).toContain("permission.catalog_version='2.0.0'");
    expect(migration).toContain("Later extension permissions outside Catalog 2.0.0 remain attached");
  });

  it("makes inactive roles and permissions ineffective without widening browser DML",()=>{
    expect(migration).toContain("JOIN erp.app_roles role ON role.id=assignment.role_id AND role.active");
    expect(migration).toContain("JOIN erp.app_permissions permission ON permission.id=mapping.permission_id AND permission.active");
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE).*authenticated/i);
    expect(remoteRepository).toContain("role_permissions(app_permissions(code,active))");
    expect(certification).toContain("Inactive roles must not grant effective permissions");
  });

  it("is atomic, repeatable, and ships runtime certification assertions",()=>{
    expect(migration.startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS active");
    expect(migration).toContain("ON CONFLICT(role_id,permission_id) DO NOTHING");
    expect(certification).toContain("ROLLBACK;");
    expect(certification).toContain("Operations Manager must have 28 Catalog 2.0.0 permissions");
  });

  it("uses runtime database roles and permissions throughout remote administration",()=>{
    expect(rolesPage).toContain("<RemoteRolesPage administration=");
    expect(remoteRolesPage).toContain("Runtime roles and effective permission mappings from the canonical database");
    expect(remoteRolesPage).toContain("Remote role administration is read-only in the browser");
    expect(usersPage).toContain("runtimeRoles.filter(role=>viewUser.systemRoles.includes(role.code)).flatMap(role=>role.permissions)");
    expect(usersPage).toContain("!remote&&<p className=\"text-sm text-amber-800\"");
  });
});
