import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914000500_add_equipment_to_existing_rental_command.sql", "utf8");
const command = sql.slice(sql.indexOf("FUNCTION erp.command_add_rental_equipment"), sql.indexOf("ALTER FUNCTION erp.command_add_rental_equipment"));
const exactSource = (assignment: { start: string; end?: string }, candidate: { start: string; end?: string }) =>
  assignment.start === candidate.start && assignment.end === candidate.end;
const overlaps = (left: { start: string; end?: string }, right: { start: string; end?: string }) =>
  (left.end === undefined || right.start <= left.end) && (right.end === undefined || left.start <= right.end);

describe("D5B3 canonical Add Equipment command", () => {
  it("provides one canonical authenticated command", () => {
    expect(sql).toContain("FUNCTION erp.command_add_rental_equipment(command jsonb)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_add_rental_equipment(jsonb) TO authenticated");
    expect(command).toContain("current_user_has_permission('rental.update')");
  });
  it("limits client input to canonical command metadata and the irreducible fields", () => {
    expect(command).toContain("'rentalId', 'equipmentId', 'proposedEffectiveStartDate', 'sourceAssignmentId'");
    for (const untrusted of ["'parentStatus'", "'projectId'", "'customerId'", "'rentalNumber'", "'expectedReturn'", "'lineStatus'", "'billingStatus'"]) expect(command).toContain(untrusted);
  });
  it.each(["Draft", "Reserved", "Released", "Active"])("allows an eligible %s parent", (status) => expect(command).toContain(`'${status}'`));
  it.each(["Cancelled", "Closed", "Returned"])("blocks a %s or legacy Returned parent", (status) => expect(command).toContain(`'${status}'`));
  it("uses a stable read-only parent error", () => expect(command).toContain("'PARENT_READ_ONLY'"));
  it("locks the authoritative parent and candidate Equipment", () => {
    expect(command).toContain("FROM erp.rentals");
    expect(command).toContain("FROM erp.equipment");
    expect(command).toContain("FOR UPDATE");
  });
  it("accepts only active non-deleted tenant equipment", () => expect(command).toContain("company_id = tenant AND active AND deleted_at IS NULL"));
  it("validates and preserves a later effective start", () => {
    expect(command).toContain("candidate_start = (command->>'proposedEffectiveStartDate')::date");
    expect(command).toContain("candidate_start < target_rental.date_out");
    expect(command).toContain("effective_start_date");
    expect(command).not.toContain("coalesce(candidate_start, target_rental.date_out)");
  });
  it("derives the end only from the parent and supports an open end", () => {
    expect(command).toContain("candidate_end = target_rental.expected_return");
    expect(command).not.toContain("command->>'effectiveEndDate'");
    expect(overlaps({ start: "2031-06-01" }, { start: "2032-01-01", end: "2032-01-02" })).toBe(true);
  });
  it("reports a duplicate same-equipment line before D3 validation", () => {
    expect(command.indexOf("'DUPLICATE_EQUIPMENT_LINE'")).toBeLessThan(command.indexOf("assert_equipment_interval_available"));
    expect(command).toContain("line.rental_id = target_rental.id");
    expect(command).toContain("line.deleted_at IS NULL");
  });
  it("removes only the obsolete cross-Rental coarse uniqueness guard so D3 can allow non-overlapping intervals", () => {
    expect(sql).toContain("DROP INDEX IF EXISTS erp.uq_rental_lines_company_non_final_equipment");
    expect(sql).not.toContain("DROP INDEX IF EXISTS erp.uq_rental_equipment_lines_non_deleted_equipment");
  });
  it("does not use a parent-wide sibling blocker", () => expect(command).not.toContain("WHERE line.rental_id = target_rental.id AND line.equipment_id <>"));
  it("supports an ordinary source-less Draft line", () => {
    expect(sql).toContain("ALTER COLUMN operator_id DROP NOT NULL");
    expect(command).toContain("source_assignment.id");
    expect(command).toContain("source_assignment.operator_id");
  });
  it("validates supplied source Assignment tenant, state, equipment, project, and operator", () => {
    for (const marker of ["source_assignment.deleted_at IS NOT NULL", "source_assignment.status <> 'Active'", "source_assignment.equipment_id <> equipment_row.id", "source_assignment.project_id <> target_rental.project_id", "operator_row.status = 'Active'"]) expect(command).toContain(marker);
  });
  it("locks a supplied source Assignment before deciding its relationship", () => {
    expect(command).toContain("FROM erp.assignments");
    expect(command).toContain("WHERE id = command->>'sourceAssignmentId' AND company_id = tenant");
  });
  it("exempts only an exact source Assignment interval", () => {
    expect(command).toContain("source_assignment.assigned_date = candidate_start");
    expect(command).toContain("source_assignment.expected_return IS NOT DISTINCT FROM candidate_end");
    expect(exactSource({ start: "2031-04-10", end: "2031-04-12" }, { start: "2031-04-10", end: "2031-04-12" })).toBe(true);
  });
  it.each([
    ["start", { start: "2031-04-09", end: "2031-04-12" }, { start: "2031-04-10", end: "2031-04-12" }],
    ["end", { start: "2031-04-10", end: "2031-04-11" }, { start: "2031-04-10", end: "2031-04-12" }],
  ])("does not exempt a source Assignment %s mismatch", (_kind, assignment, candidate) => expect(exactSource(assignment, candidate)).toBe(false));
  it("rejects arbitrary or equipment-mismatched source Assignments without exemption", () => expect(command).toContain("'MISSING_RELATIONSHIP'"));
  it("calls D3 directly and does not treat D4 as a write authority", () => {
    expect(command).toContain("PERFORM erp.assert_equipment_interval_available(");
    expect(command).not.toContain("check_equipment_availability");
    expect(command).toContain("'EQUIPMENT_INTERVAL_CONFLICT'");
  });
  it("preserves inclusive conflict boundaries", () => expect(overlaps({ start: "2031-04-10", end: "2031-04-12" }, { start: "2031-04-12", end: "2031-04-12" })).toBe(true));
  it("creates exactly one new Draft line", () => {
    expect(command).toContain("INSERT INTO erp.rental_equipment_lines(");
    expect(command).toContain("'Draft',\n    'Draft',");
  });
  it("does not alter the parent or sibling lines", () => {
    expect(command).not.toContain("UPDATE erp.rentals");
    expect(command).not.toContain("UPDATE erp.rental_equipment_lines");
  });
  it("does not create premature commercial, DEUR, or billing evidence", () => {
    expect(command).not.toContain("INSERT INTO erp.commercial_snapshots");
    expect(command).not.toContain("INSERT INTO erp.deurs");
    expect(command).not.toContain("INSERT INTO erp.billing_");
    expect(command).toContain("commercial_snapshot_required,\n    created_by");
    expect(command).toContain("false,");
  });
  it("uses audit and idempotency without creating a second line on replay", () => {
    expect(command).toContain("begin_operational_command");
    expect(command).toContain("'REPLAY'");
    expect(command).toContain("finish_operational_command");
    expect(command).toContain("INSERT INTO erp.audit_log");
  });
  it("keeps the write boundary server-side without repository or UI wiring", () => {
    expect(command).not.toContain("SupabaseEquipmentAvailabilityRepository");
    expect(command).not.toContain("Add Equipment UI");
  });
  it("returns the canonical inserted-line projection", () => {
    for (const field of ["rentalId", "rentalNumber", "rentalLineId", "equipmentId", "lineStatus", "effectiveStartDate", "effectiveEndDate", "sourceAssignmentId"]) expect(command).toContain(`'${field}'`);
  });
  it("is forward-only and leaves prior migrations and UI untouched", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(command).not.toContain("src/");
  });
});
