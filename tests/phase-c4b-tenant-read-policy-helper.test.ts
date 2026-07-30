import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260729002000_phase_c4b_tenant_read_policy_helper.sql",
  "utf8",
);

const affectedTables = [
  "assignments",
  "audit_log",
  "billing_statement_lines",
  "billing_statements",
  "customers",
  "deur_events",
  "deur_review_history",
  "deurs",
  "equipment",
  "number_sequences",
  "operators",
  "projects",
  "recovery_compensations",
  "rental_equipment_lines",
  "rentals",
] as const;

describe("Phase C4B tenant-read policy helper", () => {
  it("covers every confirmed policy with the revoked-helper dependency", () => {
    for (const table of affectedTables) expect(migration).toContain(table);
    expect(migration).toContain("USING (erp.can_read_company_row(company_id))");
    expect(migration).toContain("USING (can_read_company_row(company_id))");
  });

  it("derives one active company from auth.uid without a caller-supplied identity", () => {
    for (const token of [
      "CREATE FUNCTION can_read_company_row(target_company_id text)",
      "auth.uid() IS NOT NULL",
      "company.active",
      "caller.id = auth.uid()",
      "caller.status = 'active'",
      "caller.company_id = target_company_id",
    ]) expect(migration).toContain(token);
    expect(migration).not.toMatch(/caller_(?:id|company_id)\s+(?:uuid|text)/);
  });

  it("keeps the private company resolver private and has no cross-tenant bypass", () => {
    expect(migration).not.toContain("current_company_id()");
    expect(migration).not.toMatch(/system-administrator/i);
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("uses a minimal definer path and grants only authenticated execution", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
    expect(migration).not.toMatch(/service_role/i);
  });
});
