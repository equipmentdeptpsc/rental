import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260802003300_phase_c7_fixture_cleanup.sql"),
  "utf8",
);

describe("Phase C7 trusted fixture cleanup migration", () => {
  it("is owner-only and unavailable to all application roles", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toMatch(/session_user\s*<>\s*database_owner/i);
    expect(migration).toMatch(/current_user\s*<>\s*database_owner/i);
    expect(migration).toContain("OWNER TO postgres");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION cleanup_c7_certification_fixture\(text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i,
    );
    expect(migration).not.toMatch(/GRANT\s+EXECUTE/i);
  });

  it("uses an exact tenant, code, and confirmation allowlist", () => {
    expect(migration.match(/TENANT-UAT-C7-001/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration).toContain("CONFIRM-C7-FIXTURE-CLEANUP");
    expect(migration).toContain("environment_class = 'test'");
    expect(migration).toContain("environment_class = 'approved'");
    expect(migration).toContain("TENANT-LOCAL-001");
    expect(migration).toContain("environment_class = 'compatibility'");
  });

  it("keeps immutable DEUR history closed except for the owner transaction guard", () => {
    expect(migration).toContain("current_setting('erp.c7_fixture_cleanup', true)");
    expect(migration).toContain("set_config('erp.c7_fixture_cleanup', target_tenant_id, true)");
    expect(migration).toContain("OLD.company_id = 'TENANT-UAT-C7-001'");
    expect(migration).toContain("ERRCODE = '55000'");
    expect(migration).not.toMatch(/DISABLE\s+TRIGGER|session_replication_role/i);
  });

  it("deletes only the exact retained fixture and reports category counts", () => {
    for (const id of [
      "CUST-UAT-C7-001",
      "PRJ-UAT-C7-001",
      "OPR-UAT-C7-001",
      "EQP-UAT-C7-001",
      "ASN-UAT-C7-001",
      "RENT-UAT-C7-001",
      "LINE-UAT-C7-001",
      "DEUR-UAT-C7-001",
      "EVENT-UAT-C7-001",
      "EVENT-UAT-C7-004",
      "REF-UAT-C7-CATEGORY",
      "REF-UAT-C7-TYPE",
      "REF-UAT-C7-AVAILABLE",
      "REF-UAT-C7-ASSIGNED",
    ]) {
      expect(migration).toContain(id);
    }
    expect(migration).toContain("jsonb_build_object(");
    expect(migration).toContain("'reference_rows', deleted_references");
    expect(migration).toContain("'tenants', deleted_tenants");
  });

  it("fails closed when downstream business evidence exists", () => {
    for (const table of [
      "billing_statements",
      "customer_review_requests",
      "manager_review_requests",
      "notification_outbox",
      "audit_log",
      "recovery_compensations",
      "commercial_snapshots",
      "maintenance_records",
    ]) {
      expect(migration).toContain(`FROM ${table}`);
    }
  });

  it("does not mutate shared role or permission catalogs", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(app_roles|app_permissions|role_permissions)/i);
    expect(migration).toContain("SET search_path = erp, pg_catalog");
  });
});
