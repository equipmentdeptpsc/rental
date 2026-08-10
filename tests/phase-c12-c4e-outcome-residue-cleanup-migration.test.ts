import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260803004500_phase_c12_c4e_customer_review_outcome_residue_cleanup.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("C12.1A exact C4E outcome residue cleanup migration", () => {
  it("is exact-tenant, exact-confirmation, owner-session, and protected-local scoped", () => {
    expect(migration).toContain("target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C4E-FINANCIAL'");
    expect(migration).toContain("expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C4E-FINANCIAL'");
    expect(migration).toContain("CONFIRM-C4E-OUTCOME-RESIDUE-CLEANUP");
    expect(migration).toContain("target_tenant_id = 'TENANT-LOCAL-001'");
    expect(migration).toContain("session_user <> database_owner OR current_user <> database_owner");
    expect(migration.match(/id = 'TENANT-LOCAL-001'/g)).toHaveLength(3);
    expect(migration).not.toContain("LIKE 'TENANT-UAT-%'");
  });

  it("uses one frozen six-row hash manifest and accepts only six or zero rows", () => {
    const hashes = migration.match(/'[a-f0-9]{64}'/g) ?? [];
    expect(new Set(hashes).size).toBe(6);
    expect(migration).toContain("matched_count NOT IN (0, 6)");
    expect(migration).toContain("tenant_count <> matched_count");
    expect(migration).toContain("deleted_count <> matched_count");
    expect(migration).toContain("jsonb_build_object('customer_review_outcomes', deleted_count)");
  });

  it("requires every certified parent chain to remain absent", () => {
    expect(migration).toContain("JOIN erp.customer_review_requests");
    expect(migration).toContain("JOIN erp.deurs");
    expect(migration).toContain("JOIN erp.rentals");
    expect(migration).toContain("confrelid = 'erp.customer_review_outcomes'::regclass");
    expect(migration).toContain("parent or retained reference exists");
  });

  it("preserves ordinary immutability through one transaction-local exact exception", () => {
    expect(migration).toContain("current_setting('erp.c12_c4e_outcome_residue_cleanup', true)");
    expect(migration).toContain("set_config(");
    expect(migration).toContain("true\n  );");
    expect(migration).toContain("RAISE EXCEPTION 'customer review evidence is immutable'");
    expect(migration).not.toMatch(/session_replication_role|disable\s+trigger/i);
  });

  it("deletes only customer review outcomes and exposes no application role", () => {
    expect(migration.match(/DELETE FROM /g)).toHaveLength(1);
    expect(migration).toContain("DELETE FROM erp.customer_review_outcomes");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, pg_catalog");
    expect(migration).toContain("OWNER TO postgres");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).not.toMatch(/execute\s+immediate|\bquery\s+text|table_name|predicate/i);
  });

  it("tracks the reviewed authority-corrected pending migration 04400", () => {
    const bytes = readFileSync("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("dd9608ec631011a359c062397a2d180d835fada1201a6caeb63d5bb61cf6c125");
  });
});
