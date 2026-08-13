import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/features/auth/domain/permission";
import { SYSTEM_ROLE_DEFINITIONS } from "@/features/auth/domain/rolePermissions";

const path = resolve(process.cwd(), "supabase/migrations/20260803005500_phase_c12_users_manage_permission_catalog_parity.sql");
const sql = readFileSync(path, "utf8");

describe("C12 users.manage remote catalog parity", () => {
  it("uses the frozen application permission and role authority", () => {
    expect(PERMISSIONS.administration).toContain("users.manage");
    expect(SYSTEM_ROLE_DEFINITIONS["system-administrator"].permissions).toContain("users.manage");
    expect(SYSTEM_ROLE_DEFINITIONS["rental-operations"].permissions).not.toContain("users.manage");
    expect(SYSTEM_ROLE_DEFINITIONS.finance.permissions).not.toContain("users.manage");
    expect(SYSTEM_ROLE_DEFINITIONS.management.permissions).not.toContain("users.manage");
  });

  it("uses stable canonical identities and rejects incompatible rows", () => {
    expect(sql).toContain("'PERM-CANON-USERS-MANAGE', 'users.manage', 'Manage Users'");
    expect(sql).toContain("'ROLE-CANON-SYSTEM-ADMINISTRATOR', 'system-administrator', 'System Administrator'");
    expect(sql).toContain("canonical users.manage permission identity conflicts");
    expect(sql).toContain("canonical System Administrator role identity conflicts");
    expect(sql).not.toMatch(/ON CONFLICT[\s\S]{0,80}DO UPDATE/);
  });

  it("maps only System Administrator and explicitly protects Rental Operations", () => {
    expect(sql).toContain("VALUES('ROLE-CANON-SYSTEM-ADMINISTRATOR', 'PERM-CANON-USERS-MANAGE')");
    expect(sql).toContain("mapped_roles IS DISTINCT FROM ARRAY['system-administrator']::text[]");
    expect(sql).toContain("role.code = 'rental-operations'");
    expect(sql).toContain("rental-operations must not receive users.manage");
    expect(sql).not.toMatch(/ROLE-CANON-RENTAL-OPERATIONS['"),\s]+PERM-CANON-USERS-MANAGE/);
  });

  it("is duplicate-safe without broad or wildcard permission mutation", () => {
    expect(sql).toContain("ON CONFLICT (role_id, permission_id) DO NOTHING");
    expect(sql).toContain("count(*) FROM erp.app_permissions WHERE code = 'users.manage'");
    expect(sql).not.toMatch(/UPDATE\s+erp\.(app_permissions|app_roles|role_permissions)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+erp\.(app_permissions|app_roles|role_permissions)/i);
    expect(sql).not.toMatch(/permission\.code\s+LIKE|permission_id\s+LIKE/i);
  });

  it("does not touch authorization functions, grants, business data, or prior migrations", () => {
    expect(sql).not.toMatch(/configure_manager_review_recipient|current_user_has_permission|resolve_manager_review_recipient/);
    expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|ALTER\s+FUNCTION)\b/i);
    for (const table of ["companies", "users", "rentals", "deurs", "manager_review_requests", "notification_outbox"])
      expect(sql).not.toMatch(new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+erp\\.${table}\\b`, "i"));
    expect(sql).not.toMatch(/2026080300(?:44|45|46|47|48|49|50|51|52|53|54)00/);
  });

  it("preserves the existing rental.approve catalog mapping", () => {
    expect(sql).not.toContain("rental.approve");
    expect(sql).not.toContain("PERM-CANON-RENTAL-APPROVE");
  });
});
