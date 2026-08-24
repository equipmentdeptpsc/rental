import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const filename = "20260823000450_canonical_assignment_optional_expected_return.sql";
const sql = fs.readFileSync(path.resolve("supabase/migrations", filename), "utf8");

describe("canonical Assignment optional Expected Return remediation", () => {
  it("is a forward migration that permits NULL persistence", () => {
    expect(filename).not.toBe("20260823000100_canonical_assignment_create.sql");
    expect(sql).toContain("ALTER TABLE erp.assignments ALTER COLUMN expected_return DROP NOT NULL");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.command_create_assignment(command jsonb)");
    expect(sql).toContain("expected_on=nullif(command->>'expectedReturn','')::date");
    expect(sql).not.toMatch(/expected_on\s*=\s*coalesce/i);
    expect(sql).not.toMatch(/expected_on\s*=\s*assigned_on/i);
  });

  it("keeps Assigned Date required and validates only supplied Expected Return dates", () => {
    expect(sql).toContain("nullif(btrim(command->>'assignedDate'),'') IS NULL");
    expect(sql).toContain("assigned_on=(command->>'assignedDate')::date");
    expect(sql).toContain("expected_on IS NOT NULL AND expected_on<assigned_on");
    expect(sql).toContain("invalid_datetime_format OR datetime_field_overflow");
  });

  it("preserves authority, idempotency, audit, linkage, transition, and concurrency controls", () => {
    for (const token of [
      "erp.current_company_id()",
      "erp.current_user_has_permission('assignment.manage')",
      "erp.begin_operational_command",
      "erp.finish_operational_command",
      "'IDEMPOTENCY_MISMATCH'",
      "target_activity",
      "FOR UPDATE",
      "'ASSIGNMENT_CREATED'",
      "uq_assignment_active_equipment",
      "uq_assignment_active_operator",
      "status_id=(SELECT id FROM erp.equipment_statuses WHERE lower(code)='assigned'",
    ]) expect(sql).toContain(token);
    expect(sql.match(/INSERT INTO erp\.audit_log/g)).toHaveLength(1);
  });

  it("retains the hardened browser boundary", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.command_create_assignment(jsonb) FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_create_assignment(jsonb) TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.assignments FROM PUBLIC,anon,authenticated");
    expect(sql).not.toContain("GRANT INSERT");
  });

  it("preserves Remarks instead of replacing a supplied nonblank value", () => {
    expect(sql).toContain("coalesce(command->>'remarks','')");
    expect(sql).toContain("'remarks',created_assignment.remarks");
  });
});
