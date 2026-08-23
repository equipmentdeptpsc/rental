import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260823000150_canonical_project_create.sql", "utf8");

describe("canonical Project create migration", () => {
  it("adds only the scoped permission and System Administrator mapping", () => {
    expect(sql).toContain("'project.manage'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).not.toMatch(/r\.code\s*=\s*'(?!system-administrator)/);
  });

  it("derives tenant and actor and rejects browser-controlled authority fields", () => {
    expect(sql).toContain("tenant text=erp.current_company_id()");
    expect(sql).toContain("actor text=auth.uid()::text");
    for (const field of ["companyId", "createdBy", "updatedBy", "active", "deletedAt", "rowVersion", "projectManager", "client", "legacyPayload"]) expect(sql).toContain(`'${field}'`);
  });

  it("uses canonical command, idempotency, audit, lifecycle and customer boundaries", () => {
    for (const marker of ["command_create_project", "begin_operational_command", "finish_operational_command", "PROJECT_CREATED", "PROJECT_CODE_CONFLICT", "CUSTOMER_INVALID", "project_code_value IS NULL", "project_name_value IS NULL", "target_customer.active", "true,NULL,actor,actor,tenant"]) expect(sql).toContain(marker);
  });

  it("keeps direct writes denied and grants only authenticated RPC execution", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_create_project(jsonb) FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_create_project(jsonb) TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.projects FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)[\s\S]*erp\.projects/i);
  });
});
