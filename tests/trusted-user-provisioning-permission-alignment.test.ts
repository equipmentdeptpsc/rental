import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import canonicalMatrix from "../docs/rbac/role-permission-matrix.json";

const migration = readFileSync("supabase/migrations/20260825000200_trusted_user_provisioning_permission_alignment.sql", "utf8");
const worker = readFileSync("worker/userAdministration.ts", "utf8");
const historical = readFileSync("supabase/migrations/20260822000100_trusted_remote_user_administration.sql", "utf8");

describe("trusted user provisioning Catalog 2.0 alignment", () => {
  it("uses narrow canonical permissions for create, role assignment, and credential reset", () => {
    expect(migration).toContain("permission_code='users.create'");
    expect(migration).toContain("permission_code='roles.assign'");
    expect(migration).toContain("permission_code='users.password.reset'");
    expect(migration).not.toContain("permission_code='users.manage'");
    expect(worker).toContain('["users.create","roles.assign"]');
    expect(worker).toContain('["users.password.reset"]');
    expect(worker).not.toContain('.eq("permission_code","users.manage")');
  });

  it("keeps create authority confined to System Administrator in the approved matrix", () => {
    expect(canonicalMatrix.grants["system-administrator"].allPermissions).toBe(true);
    for (const role of ["operations-manager", "billing-staff"] as const) {
      const grant = canonicalMatrix.grants[role];
      expect("users" in grant.standard ? grant.standard.users : []).not.toContain("create");
      expect(grant.workflow).not.toContain("roles.assign");
    }
  });

  it("requires active nondeprecated roles in both worker and trusted command", () => {
    expect(worker).toContain('.select("code,active,deprecated_at")');
    expect(worker).toContain('.eq("active",true).is("deprecated_at",null)');
    expect(migration).toMatch(/r\.code=requested AND r\.active AND r\.deprecated_at IS NULL/);
    expect(migration).toMatch(/r\.code=role_code AND r\.active AND r\.deprecated_at IS NULL/);
    expect(migration).toContain("ON CONFLICT DO NOTHING");
  });

  it("preserves service-role-only execution, tenant derivation, idempotency, audit, and compensation", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    for (const token of ["user_provisioning_commands", "IDEMPOTENCY_MISMATCH", "USER_CREATED", "USER_ROLE_ASSIGNED", "company_id=tenant"]) {
      expect(migration).toContain(token);
    }
    expect(worker).not.toMatch(/command\.(?:companyId|actorId)/);
    expect(worker).toContain("auth.admin.deleteUser(auth.data.user.id)");
    expect(worker).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(worker).not.toContain('request.headers.get("x-service-role-key")');
    expect(worker).not.toMatch(/command\.(?:serviceRoleKey|service_role_key)/);
  });

  it("leaves applied history and Rental approval separation untouched", () => {
    expect(historical).toContain("permission_code='users.manage'");
    expect(migration).not.toMatch(/rental\.approval|command_decide_rental_approval|rentals/);
  });
});
