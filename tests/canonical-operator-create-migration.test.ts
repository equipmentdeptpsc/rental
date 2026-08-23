import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260823000200_canonical_operator_create.sql", "utf8");

describe("canonical Operator create migration", () => {
  it("adds only operator.manage and maps it only to System Administrator", () => {
    expect(sql).toContain("'operator.manage'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).not.toContain("'operator.create'");
    expect(sql).not.toContain("'operator.update'");
    expect(sql).not.toContain("'operator.delete'");
  });

  it("derives authority and rejects identity, lifecycle, PIN, and legacy fields", () => {
    expect(sql).toContain("tenant text=erp.current_company_id()");
    expect(sql).toContain("actor text=auth.uid()::text");
    for (const field of ["companyId", "status", "deletedAt", "rowVersion", "createdBy", "updatedBy", "userId", "applicationUserId", "authUserId", "username", "password", "pin", "pinVerifier", "operatorUserLink", "linkedUser", "legacyPayload", "certificationTypes"]) expect(sql).toContain(`'${field}'`);
  });

  it("uses canonical lifecycle, validation, command, idempotency, and audit boundaries", () => {
    for (const marker of ["command_create_operator", "begin_operational_command", "finish_operational_command", "OPERATOR_CREATED", "OPERATOR_ID_CONFLICT", "VALIDATION_REJECTED", "'Active'", "'None'", "created_operator.row_version"]) expect(sql).toContain(marker);
    for (const certification of ["Heavy Machinery", "Forklift", "Crane Logistics", "None"]) expect(sql).toContain(certification);
  });

  it("keeps direct writes denied and grants only authenticated RPC execution", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_create_operator(jsonb) FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_create_operator(jsonb) TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.operators FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)[\s\S]*erp\.operators/i);
  });
});
