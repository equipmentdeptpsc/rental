import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const foundation = readFileSync("supabase/migrations/20260904000200_operator_certification_master_data.sql", "utf8");
const migration = readFileSync("supabase/migrations/20260904000300_align_operator_certification_action_permissions.sql", "utf8");

describe("operator certification Catalog 2.0 permission alignment", () => {
  it("replaces only the deprecated certification RPC guards with their canonical action permissions", () => {
    expect(migration).toContain("'erp.list_certification_types(boolean)'::regprocedure, 'masterData.manage', 'masterData.read'");
    expect(migration).toContain("'erp.list_assignable_certification_types()'::regprocedure, 'operator.manage', 'operator.update'");
    expect(migration).toContain("'erp.command_create_certification_type(jsonb)'::regprocedure, 'masterData.manage', 'masterData.create'");
    expect(migration).toContain("'erp.command_update_certification_type(jsonb)'::regprocedure, 'masterData.manage', 'masterData.update'");
    expect(migration).toContain("'erp.command_set_certification_type_active(jsonb,boolean)'::regprocedure, 'masterData.manage', 'masterData.update'");
    expect(migration).toContain("'erp.command_assign_operator_certification(jsonb)'::regprocedure, 'operator.manage', 'operator.update'");
    expect(migration).toContain("'erp.command_remove_operator_certification(jsonb)'::regprocedure, 'operator.manage', 'operator.update'");
  });

  it("keeps the independent operator detail read guard and terminal wrapper semantics unchanged", () => {
    expect(foundation).toContain("tenant=erp.require_certification_actor('operator.read');");
    expect(foundation).toContain("SELECT erp.command_set_certification_type_active(command,true)");
    expect(foundation).toContain("SELECT erp.command_set_certification_type_active(command,false)");
    expect(migration).not.toContain("erp.list_operator_certifications(text)'::regprocedure");
  });

  it("does not alter role mappings, grants, tables, or business data", () => {
    for (const forbidden of ["role_permissions", "app_permissions", "CREATE TABLE", "ALTER TABLE", "INSERT INTO", "UPDATE erp.", "DELETE FROM", "GRANT ", "REVOKE "]) {
      expect(migration).not.toContain(forbidden);
    }
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("certification permission guard not found");
  });
});
