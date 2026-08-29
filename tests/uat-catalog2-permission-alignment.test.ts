import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("UAT provisioning Catalog 2.0 permission alignment", () => {
  it("realigns only reached legacy aggregate checks", () => {
    const sql = readFileSync("supabase/migrations/20260830000300_align_provisioning_commands_catalog2_permissions.sql", "utf8");
    expect(sql).toContain("project.manage', 'project.create");
    expect(sql).toContain("operator.manage', 'operator.create");
    expect(sql).toContain("assignment.manage', 'assignment.create");
    expect(sql).toContain("rental.manage', 'rental.create");
    expect(sql).toContain("rental.manage', 'rental.activate");
    expect(sql).not.toContain("INSERT INTO erp.role_permissions");
  });
});
