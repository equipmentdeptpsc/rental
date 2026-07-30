import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    "supabase/migrations/20260729000600_phase_c2h_security_hardening.sql",
  ),
  "utf8",
);
const grantStatements = migration
  .split(";")
  .filter((statement) => /GRANT EXECUTE ON FUNCTION/i.test(statement));
const anonymousGrant =
  grantStatements.find((statement) => /TO anon, authenticated/i.test(statement)) ??
  "";
const authenticatedGrant =
  grantStatements.find((statement) => /TO authenticated/i.test(statement)) ?? "";

describe("Phase C2H forward security hardening", () => {
  it("removes default PUBLIC and anonymous execution from every ERP function", () => {
    expect(migration).toContain("WHERE n.nspname = 'erp'");
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon",
    );
    expect(anonymousGrant).not.toContain(
      "command_create_customer_review_request",
    );
    expect(anonymousGrant).not.toContain("get_rental_closure_readiness");
  });

  it("exposes only the dedicated token-scoped customer-review RPCs anonymously", () => {
    expect(anonymousGrant).toContain("get_public_customer_review(jsonb)");
    expect(anonymousGrant).toContain(
      "public_acknowledge_customer_review(jsonb)",
    );
    expect(anonymousGrant).toContain("public_reject_customer_review(jsonb)");
    expect(anonymousGrant).not.toContain("resolve_public_review");
    expect(anonymousGrant).not.toContain("current_app_user");
    expect(anonymousGrant).not.toContain("current_user_has_permission");
  });

  it("retains authenticated command entry points without weakening role checks", () => {
    expect(authenticatedGrant).toContain(
      "command_create_customer_review_request(jsonb)",
    );
    expect(authenticatedGrant).toContain(
      "get_rental_closure_readiness(jsonb)",
    );
    expect(authenticatedGrant).toContain("command_close_rental(jsonb)");
    expect(migration).not.toContain("GRANT EXECUTE ON ALL FUNCTIONS");
  });

  it("limits user-role reads to self or users.manage within the active company", () => {
    const policy =
      migration.match(
        /CREATE POLICY user_roles_authenticated_read([\s\S]*?)\);/i,
      )?.[1] ?? "";

    expect(policy).toContain("user_id = auth.uid()");
    expect(policy).toContain(
      "current_user_has_permission('users.manage')",
    );
    expect(policy).toContain(
      "target_user.company_id = current_company_id()",
    );
    expect(policy).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("preserves global reference-catalog policies intentionally", () => {
    expect(migration).not.toContain(
      "DROP POLICY IF EXISTS permissions_authenticated_read",
    );
    expect(migration).not.toContain(
      "DROP POLICY IF EXISTS roles_authenticated_read",
    );
    expect(migration).not.toContain(
      "DROP POLICY IF EXISTS role_permissions_authenticated_read",
    );
    expect(migration).toContain(
      "Intentional global authenticated read of the frozen permission catalog.",
    );
  });

  it("does not persist or expose raw tokens or privileged identity data", () => {
    expect(migration).not.toMatch(/\b(raw_token|token_hash)\b/i);
    expect(migration).not.toMatch(/\b(service_role|SUPABASE_TEST_SERVICE_KEY)\b/);
  });
});
