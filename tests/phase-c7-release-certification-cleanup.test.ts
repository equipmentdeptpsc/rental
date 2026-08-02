import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const existing = fs.readFileSync(path.resolve("supabase/migrations/20260802003300_phase_c7_fixture_cleanup.sql"), "utf8");
const migration = fs.readFileSync(path.resolve("supabase/migrations/20260802003700_phase_c7_release_certification_cleanup.sql"), "utf8");

describe("C7 exact-scoped release certification cleanup", () => {
  it("accepts only the exact release tenant and confirmation", () => {
    expect(migration).toContain("target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C7-RELEASE-001'");
    expect(migration).toContain("expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C7-RELEASE-001'");
    expect(migration).toContain("confirmation IS DISTINCT FROM 'CONFIRM-C7-RELEASE-CLEANUP'");
    expect(migration).toContain("target_tenant_id = 'TENANT-LOCAL-001'");
    expect(migration).not.toMatch(/LIKE\s+'TENANT-UAT-%'[^\n]*target_tenant_id/i);
  });

  it("requires a database-owner session and test-class tenant", () => {
    expect(migration).toContain("session_user <> database_owner OR current_user <> database_owner");
    expect(migration).toContain("code <> expected_tenant_code OR environment_class <> 'test'");
    expect(migration).toContain("environment_class = 'approved'");
    expect(migration).toContain("TENANT-LOCAL-001' AND code = 'LOCAL' AND environment_class = 'compatibility'");
  });

  it("denies every browser/backend API role and preserves a minimal search path", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, pg_catalog");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION cleanup_c7_release_certification_fixture\(text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toContain("OWNER TO postgres");
  });

  it("keeps immutable deletion exceptional, exact, owner-only, and transaction-local", () => {
    expect(migration).toContain("current_setting('erp.c7_release_fixture_cleanup', true) = 'TENANT-UAT-C7-RELEASE-001'");
    expect(migration).toContain("OLD.company_id = 'TENANT-UAT-C7-RELEASE-001'");
    expect(migration).toContain("set_config('erp.c7_release_fixture_cleanup', target_tenant_id, true)");
    expect(migration).not.toMatch(/DISABLE\s+TRIGGER|session_replication_role/i);
    expect(migration).toContain("immutable historical record cannot be changed");
  });

  it("covers downstream evidence in dependency order and preserves shared catalogs", () => {
    const ordered = [
      "notification_delivery_attempts", "notification_outbox", "customer_review_outcomes",
      "manager_review_outcomes", "recovery_compensations", "deur_activity_logs",
      "deur_meter_checkpoints", "billing_statement_lines", "deur_events", "deurs",
      "billing_statements", "rental_contracts", "commercial_snapshots", "audit_log",
      "operational_command_idempotency", "rental_equipment_lines", "rentals",
      "assignments", "users", "equipment", "operators", "projects", "customers", "companies",
    ];
    let cursor = -1;
    for (const relation of ordered) {
      const next = migration.indexOf(`DELETE FROM ${relation}`, cursor + 1);
      expect(next, relation).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(migration).not.toMatch(/DELETE FROM (?:app_roles|app_permissions|role_permissions)\b/);
    expect(migration).toContain("r.id LIKE 'REF-UAT-C7-RELEASE-%'");
    expect(migration).toContain("NOT EXISTS (SELECT 1 FROM equipment e WHERE e.status_id = r.id)");
  });

  it("returns safe aggregate counts and accepts no executable authority input", () => {
    expect(migration).toMatch(/RETURNS jsonb/);
    expect(migration).toContain("RETURN removed");
    expect(migration).not.toMatch(/EXECUTE\s+format|EXECUTE\s+target|query\s+text|schema\s+text|predicate\s+text/i);
    expect(migration).not.toMatch(/jsonb_build_object\([^)]*(?:target_tenant_id|expected_tenant_code|confirmation)/i);
  });

  it("is forward-only and leaves the existing cleanup migration unchanged", () => {
    expect(crypto.createHash("sha256").update(existing).digest("hex")).toBe(
      "cf490d4a11c6f85a10598fb0d60fac551dadcfe7576bc6f9a7b397b6337051d5",
    );
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION cleanup_c7_certification_fixture");
    expect(migration).not.toMatch(/(?:DROP|ALTER)\s+TABLE/i);
  });
});
