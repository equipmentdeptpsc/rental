import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260904000200_operator_certification_master_data.sql", "utf8");

describe("Milestone 11.2A canonical Operator certification foundation", () => {
  it("creates tenant-scoped controlled types and multiple canonical assignments", () => {
    for (const token of [
      "CREATE TABLE erp.certification_types", "CREATE TABLE erp.operator_certifications",
      "company_id text NOT NULL REFERENCES erp.companies(id)",
      "uq_certification_types_company_name_normalized", "PRIMARY KEY(operator_id,certification_type_id)",
      "operator_certifications_tenant_guard", "ON DELETE RESTRICT",
    ]) expect(migration).toContain(token);
  });

  it("preserves legacy values deterministically and treats None as no assignment", () => {
    for (const value of ["Heavy Machinery", "Forklift", "Crane Logistics"]) expect(migration).toContain(`('${value}')`);
    expect(migration).toContain("unexpected historical operator certification value; migration stopped without changing data");
    expect(migration).toContain("btrim(o.certification_type)<>'None'");
    expect(migration).not.toContain("('None') AS v(name)");
    expect(migration).not.toContain("DROP COLUMN certification_type");
  });

  it("uses canonical read and command boundaries with existing permissions", () => {
    for (const token of [
      "list_certification_types", "list_assignable_certification_types", "list_operator_certifications",
      "command_create_certification_type", "command_update_certification_type",
      "command_activate_certification_type", "command_deactivate_certification_type",
      "command_assign_operator_certification", "command_remove_operator_certification",
      "masterData.manage", "operator.manage", "operator.read",
      "begin_operational_command", "finish_operational_command", "erp.audit_log",
      "CERTIFICATION_TYPE_CREATED", "CERTIFICATION_TYPE_UPDATED", "CERTIFICATION_TYPE_ACTIVATED",
      "CERTIFICATION_TYPE_DEACTIVATED", "OPERATOR_CERTIFICATION_ASSIGNED", "OPERATOR_CERTIFICATION_REMOVED",
    ]) expect(migration).toContain(token);
  });

  it("keeps type deactivation non-destructive and rejects cross-tenant assignment", () => {
    expect(migration).toContain("CERTIFICATION_TYPE_INACTIVE");
    expect(migration).toContain("operator certification tenant mismatch");
    expect(migration).toContain("REVOKE ALL ON TABLE erp.certification_types,erp.operator_certifications");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION");
  });
});
