import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260729001900_phase_c4b_user_profile_policy_helper.sql",
  "utf8",
);

describe("Phase C4B authenticated User profile policy helper", () => {
  it("replaces the policy that directly invoked the private company helper", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS tenant_read ON users");
    expect(migration).toContain("CREATE POLICY users_authenticated_read");
    expect(migration).toContain("USING (can_read_target_user(id))");
    expect(migration).not.toContain("USING (company_id=current_company_id())");
  });

  it("derives the caller only from auth.uid and exposes only a boolean target check", () => {
    expect(migration).toContain("CREATE FUNCTION can_read_target_user(target_user_id uuid)");
    expect(migration).toContain("RETURNS boolean");
    expect(migration).toContain("target_user_id = auth.uid()");
    expect(migration).not.toMatch(/caller_(?:id|company_id)\s+uuid/);
  });

  it("keeps administrative visibility same-company, active, and permission based", () => {
    for (const token of [
      "company.active",
      "target.company_id = caller.company_id",
      "target.status = 'active'",
      "caller.status = 'active'",
      "permission.code = 'users.manage'",
    ]) {
      expect(migration).toContain(token);
    }
    expect(migration).not.toMatch(/system-administrator/i);
  });

  it("uses a minimal definer path and grants only authenticated execution", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
    expect(migration).not.toMatch(/service_role/i);
  });
});
