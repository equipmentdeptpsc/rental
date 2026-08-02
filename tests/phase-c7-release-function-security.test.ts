import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const releaseSql = fs.readFileSync(path.resolve("supabase/migrations/20260802003600_phase_c7_project_readiness_schema_correction.sql"), "utf8");
const commandSql = fs.readFileSync(path.resolve("supabase/migrations/20260802003500_phase_c7_deur_release_readiness_gate.sql"), "utf8");
const tenantPolicySql = fs.readFileSync(path.resolve("supabase/migrations/20260729002000_phase_c4b_tenant_read_policy_helper.sql"), "utf8");
const foundationSql = fs.readFileSync(path.resolve("supabase/migrations/20260722000200_rental_deur.sql"), "utf8");

describe("C7 release-function relation security model", () => {
  it("scopes every browser-facing readiness source by the authenticated company", () => {
    expect(releaseSql).toContain("FROM rentals WHERE id=target_rental_id AND company_id=tenant");
    expect(releaseSql).toContain("l.company_id=tenant");
    for (const relation of ["equipment", "assignments", "operators", "projects"]) {
      expect(releaseSql).toMatch(new RegExp(`JOIN ${relation} [a-z] ON[^\\n]+company_id=tenant`));
      expect(tenantPolicySql).toContain(`'${relation}'`);
    }
    for (const relation of ["rentals", "rental_equipment_lines"]) expect(tenantPolicySql).toContain(`'${relation}'`);
  });

  it("treats commercial snapshots as a private child, not a browser-facing tenant table", () => {
    expect(releaseSql).toContain("LEFT JOIN commercial_snapshots cs ON cs.rental_equipment_line_id=l.id AND cs.rental_id=target.id");
    expect(foundationSql).toContain("CONSTRAINT fk_snapshot_line_rental FOREIGN KEY (rental_equipment_line_id,rental_id)");
    expect(tenantPolicySql).not.toContain("'commercial_snapshots'");
  });

  it("authorizes before tenant-scoped lookup and locks without caller-supplied company authority", () => {
    const actor = commandSql.indexOf("tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active')");
    const permission = commandSql.indexOf("current_user_has_permission('rental.release')");
    const lock = commandSql.indexOf("PERFORM id FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE");
    expect(actor).toBeGreaterThan(-1); expect(permission).toBeGreaterThan(actor); expect(lock).toBeGreaterThan(permission);
    expect(commandSql).not.toMatch(/companyId|company_id\s*=\s*command/);
  });
});
