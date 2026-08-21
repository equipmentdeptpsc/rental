import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260821000150_minimal_billing_rbac_prerequisite.sql", "utf8");

describe("Milestone 11B.5 minimal Billing RBAC prerequisite", () => {
  it("adds only the approved Billing permissions and Finance role", () => {
    expect(sql).toContain("'billing.create'");
    expect(sql).toContain("'billing.update'");
    expect(sql).toContain("'finance', 'Finance'");
    expect(sql).not.toMatch(/billing-staff|management|operator(?:'|\")/i);
  });

  it("maps Finance and System Administrator without changing users or Rental Operations", () => {
    expect(sql).toContain("role.code IN ('finance', 'system-administrator')");
    expect(sql).toContain("permission.code IN ('billing.read', 'billing.create', 'billing.update')");
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?erp\.user_roles/i);
    expect(sql).not.toMatch(/DELETE|UPDATE\s+erp\.|ALTER|DROP|07700/i);
  });

  it("is additive, deterministic, and pre-P7 compatible", () => {
    expect(sql.trimStart()).toMatch(/^BEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql.match(/ON CONFLICT/g)).toHaveLength(3);
    expect(sql).not.toMatch(/catalog_version|canonical_role_permission_catalog|permission_compatibility_aliases/);
  });
});
