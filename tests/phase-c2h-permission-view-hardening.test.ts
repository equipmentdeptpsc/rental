import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    "supabase/migrations/20260729000700_phase_c2h_permission_view_hardening.sql",
  ),
  "utf8",
);
const securityMigration = fs.readFileSync(
  path.resolve(
    "supabase/migrations/20260729000600_phase_c2h_security_hardening.sql",
  ),
  "utf8",
);
const authenticationProvider = fs.readFileSync(
  path.resolve(
    "src/integrations/supabase/SupabaseAuthenticationProvider.ts",
  ),
  "utf8",
);

describe("Phase C2H permission-view hardening", () => {
  it("makes the existing permission projection security-invoker", () => {
    expect(migration).toContain("ALTER VIEW effective_user_permissions");
    expect(migration).toContain("SET (security_invoker = true)");
    expect(migration).not.toContain("DROP VIEW");
    expect(migration).not.toContain("GRANT SELECT");
  });

  it("explicitly denies anonymous and PUBLIC direct view access", () => {
    expect(migration).toContain(
      "REVOKE SELECT ON effective_user_permissions FROM PUBLIC, anon",
    );
  });

  it("relies on the tenant-scoped user_roles policy for direct reads", () => {
    expect(securityMigration).toContain("user_id = auth.uid()");
    expect(securityMigration).toContain(
      "current_user_has_permission('users.manage')",
    );
    expect(securityMigration).toContain(
      "target_user.company_id = current_company_id()",
    );
    expect(securityMigration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("preserves the provider query shape and constrains it to the session user", () => {
    expect(authenticationProvider).toContain(
      '.from("effective_user_permissions")',
    );
    expect(authenticationProvider).toContain(
      '.select("permission_code").eq("user_id", session.user.id)',
    );
  });

  it("keeps the internal permission check current-caller scoped", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION current_user_has_permission(required_permission text)",
    );
    expect(migration).toContain("permission.user_id = auth.uid()");
    expect(migration).not.toMatch(
      /current_user_has_permission\s*\([^)]*(user_id|target_user)/i,
    );
  });

  it("retains SECURITY DEFINER with an explicit minimal search path", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth");
    expect(migration).not.toMatch(
      /SET search_path\s*=[^;\n]*\bpublic\b/i,
    );
  });

  it("denies direct helper execution to anonymous and authenticated callers", () => {
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION current_user_has_permission(text)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("does not alter global catalog reads or broaden writes", () => {
    for (const object of [
      "app_permissions",
      "app_roles",
      "role_permissions",
    ]) {
      expect(migration).not.toContain(`GRANT SELECT ON ${object}`);
      expect(migration).not.toContain(`GRANT INSERT ON ${object}`);
      expect(migration).not.toContain(`GRANT UPDATE ON ${object}`);
      expect(migration).not.toContain(`GRANT DELETE ON ${object}`);
    }
  });
});
