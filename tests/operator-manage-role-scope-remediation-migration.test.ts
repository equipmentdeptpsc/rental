import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/migrations/20260823000200_canonical_operator_create.sql");
const sql = readFileSync("supabase/migrations/20260823000250_operator_manage_role_scope_remediation.sql", "utf8");

describe("Operator manage role-scope remediation", () => {
  it("leaves the database-certified Operator migration unchanged", () => {
    expect(createHash("sha256").update(source).digest("hex").toUpperCase()).toBe("0596BF6430122720433E565B43A46CB7DDA91AFDB8D86B1C1FE8024B72DAC3AE");
  });

  it("preserves exactly one System Administrator mapping", () => {
    expect(sql).toContain("code='system-administrator'");
    expect(sql).toContain("VALUES(system_administrator_role_id,operator_manage_permission_id)");
    expect(sql).toContain("ON CONFLICT(role_id,permission_id) DO NOTHING");
  });

  it("deletes only non-System-Administrator operator.manage mappings", () => {
    expect(sql).toContain("DELETE FROM erp.role_permissions");
    expect(sql).toContain("permission_id=operator_manage_permission_id");
    expect(sql).toContain("role_id<>system_administrator_role_id");
    expect(sql).not.toMatch(/DELETE FROM erp\.(?:app_permissions|user_roles)/);
    expect(sql).not.toMatch(/UPDATE\s+erp\.|GRANT\s|REVOKE\s|CREATE\s+FUNCTION|ALTER\s+FUNCTION/i);
  });

  it("asserts the permission and final authorization matrix", () => {
    expect(sql).toContain("code='operator.manage'");
    expect(sql).toContain("operator.manage permission catalog invariant failed");
    expect(sql).toContain("non-system-administrator operator.manage mapping remains");
  });
});
