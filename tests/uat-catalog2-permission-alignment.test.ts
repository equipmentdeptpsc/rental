import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260830000300_align_provisioning_commands_catalog2_permissions.sql", "utf8");

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION erp.${name}(command jsonb)`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("UAT provisioning Catalog 2.0 permission alignment", () => {
  it("uses explicit canonical function definitions rather than runtime DDL reconstruction", () => {
    expect(sql).not.toContain("pg_get_functiondef");
    expect(sql).not.toContain("EXECUTE definition");
    expect(sql).not.toContain("definition := replace");
  });

  it.each([
    ["command_create_project", "project.create", "project.manage"],
    ["command_create_operator", "operator.create", "operator.manage"],
    ["command_create_assignment", "assignment.create", "assignment.manage"],
    ["command_create_reserved_rental", "rental.create", "rental.manage"],
  ])("aligns %s to its Catalog 2.0 action permission", (name, expected, legacy) => {
    const body = functionBody(name);
    expect(body).toContain(`current_user_has_permission('${expected}')`);
    expect(body).not.toContain(`current_user_has_permission('${legacy}')`);
  });

  it("keeps activation on the canonical rental.activate lifecycle contract", () => {
    const body = functionBody("command_activate_rental");
    expect(body).toContain("'rental.activate'");
    expect(body).not.toContain("'rental.manage'");
  });

  it("does not broaden role permissions", () => {
    expect(sql).not.toContain("INSERT INTO erp.role_permissions");
    expect(sql).not.toContain("UPDATE erp.role_permissions");
  });
});
