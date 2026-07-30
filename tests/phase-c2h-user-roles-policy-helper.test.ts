import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    "supabase/migrations/20260729000800_phase_c2h_user_roles_policy_helper.sql",
  ),
  "utf8",
);

describe("Phase C2H user_roles policy helper", () => {
  it("accepts only a target user ID and derives the caller from auth.uid", () => {
    expect(migration).toContain(
      "CREATE FUNCTION can_manage_target_user_role(target_user_id uuid)",
    );
    expect(migration).toContain("caller.id = auth.uid()");
    expect(migration).not.toMatch(
      /can_manage_target_user_role\s*\([^)]*(caller|company|role|permission)/i,
    );
  });

  it("returns false for unauthenticated or invalid targets", () => {
    expect(migration).toContain("auth.uid() IS NOT NULL");
    expect(migration).toContain("target_user_id IS NOT NULL");
    expect(migration).toContain("target.id = target_user_id");
  });

  it("requires active users in one active company", () => {
    expect(migration).toContain("company.active");
    expect(migration).toContain("caller.status = 'active'");
    expect(migration).toContain("target.status = 'active'");
    expect(migration).toContain(
      "target.company_id = caller.company_id",
    );
    expect(migration).not.toMatch(/system-administrator/i);
  });

  it("uses only the frozen users.manage permission", () => {
    expect(migration).toContain("permission.code = 'users.manage'");
    expect(migration).toContain("caller_role.user_id = caller.id");
    expect(migration).not.toContain("required_permission");
  });

  it("is a boolean-only security-definer helper with a minimal search path", () => {
    expect(migration).toContain("RETURNS boolean");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth");
    expect(migration).not.toMatch(
      /SET search_path\s*=[^;\n]*\bpublic\b/i,
    );
  });

  it("is callable only by authenticated for RLS evaluation", () => {
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION can_manage_target_user_role(uuid)",
    );
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION can_manage_target_user_role(uuid)",
    );
    expect(migration).toContain("TO authenticated");
  });

  it("replaces the policy with self-or-scoped-helper access", () => {
    expect(migration).toContain(
      "DROP POLICY IF EXISTS user_roles_authenticated_read ON user_roles",
    );
    expect(migration).toContain("user_id = auth.uid()");
    expect(migration).toContain(
      "OR can_manage_target_user_role(user_id)",
    );
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(migration).not.toContain("current_company_id()");
    expect(migration).not.toContain("current_user_has_permission(");
  });
});
