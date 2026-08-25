import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825000700_catalog_2_user_list_visibility.sql",
  "utf8",
);
const repository = readFileSync(
  "src/integrations/supabase/SupabaseRemoteUserAdministration.ts",
  "utf8",
);
const page = readFileSync("src/features/users/pages/UsersPage.tsx", "utf8");

describe("Catalog 2.0 remote Users-list visibility", () => {
  it("supersedes both legacy users.manage RLS helpers with users.read", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.can_read_target_user");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.can_manage_target_user_role");
    expect(migration.match(/permission\.code = 'users\.read'/g)).toHaveLength(2);
    expect(migration).not.toContain("users.manage");
  });

  it("normalizes both historical policy end states to Catalog 2.0", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS self_or_unlinked_user_administrator ON erp.users");
    expect(migration).toContain("CREATE POLICY users_authenticated_read");
    expect(migration).toContain("USING (erp.can_read_target_user(id))");
    expect(migration).toContain("to_regprocedure('erp.current_linked_operator_id()') IS NOT NULL");
    expect(migration).toContain("policy.polname='unlinked_authorization_administrator_read'");
    for (const table of ["app_roles", "app_permissions", "role_permissions"])
      expect(migration).toContain(`ON erp.${table} FOR SELECT TO authenticated`);
  });

  it("does not parse missing P9 helpers in the historical UAT branch", () => {
    expect(migration).toContain("EXECUTE $policy$");
    expect(migration).not.toMatch(/CREATE POLICY catalog_2_authorization_administrator_read\s+ON erp\.app_roles[\s\S]*?^\);/m);
  });

  it("keeps tenant isolation and active-caller governance", () => {
    expect(migration.match(/target\.company_id = caller\.company_id/g)).toHaveLength(2);
    expect(migration.match(/caller\.status = 'active'/g)).toHaveLength(2);
    expect(migration.match(/company\.active/g)).toHaveLength(2);
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("keeps inactive application users visible for administration", () => {
    expect(migration).not.toContain("target.status = 'active'");
  });

  it("retains the direct PostgREST safe-field projection and role mapping", () => {
    const projection = "id,username,display_name,email,company_id,status,operator_id,created_at,updated_at,user_roles(app_roles(code))";
    expect(repository).toContain(`.from("users").select("${projection}")`);
    for (const forbidden of ["password", "encrypted_password", "service_role"])
      expect(projection).not.toContain(forbidden);
  });

  it("does not filter retrieved remote users except by explicit search", () => {
    expect(page).toContain("const all=remote?remoteUsers:");
    expect(page).toContain("return term?all.filter");
    expect(page).toContain(":all}");
  });
});
