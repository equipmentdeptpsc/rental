import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914000300_line_scoped_rental_lifecycle_commands.sql", "utf8");
const d5b1bSql = readFileSync("supabase/migrations/20260914000200_parent_rental_terminal_lifecycle_remediation.sql", "utf8");
const section = (name: string, next: string) => sql.slice(sql.indexOf(`FUNCTION erp.${name}`), sql.indexOf(`FUNCTION erp.${next}`));
const readiness = sql.slice(sql.indexOf("FUNCTION erp.rental_line_release_readiness"), sql.indexOf("FUNCTION erp.command_reserve_rental_line"));
const reserve = section("command_reserve_rental_line", "command_release_rental_line");
const release = section("command_release_rental_line", "command_activate_rental_line");
const activate = section("command_activate_rental_line", "command_cancel_rental_line");
const cancel = section("command_cancel_rental_line", "command_return_rental_line");
const returning = sql.slice(sql.indexOf("FUNCTION erp.command_return_rental_line"));

describe("D5B1C line-scoped equipment lifecycle commands", () => {
  it.each(["command_reserve_rental_line", "command_release_rental_line", "command_activate_rental_line", "command_cancel_rental_line", "command_return_rental_line"])("provides %s", (name) => expect(sql).toContain(`FUNCTION erp.${name}`));
  it.each([reserve, release, activate, cancel, returning])("uses the terminal parent guard", (command) => expect(command).toContain("rental_parent_is_mutable"));
  it.each([reserve, release, activate, cancel, returning])("returns the canonical read-only result for a Cancelled, Closed, or legacy Returned parent", (command) => {
    expect(command).toContain("PARENT_READ_ONLY");
  });
  it.each([reserve, release, activate, cancel])("targets and locks exactly one line", (command) => {
    expect(command).toContain("rentalLineId");
    expect(command).toContain("FOR UPDATE");
    expect(command).toContain("'RENTAL_LINE'");
  });

  it("reserves a Draft line without changing sibling lines or the parent", () => {
    expect(reserve).toContain("canonical_line_status = 'Reserved'");
    expect(reserve).toContain("<> 'Draft'");
    expect(reserve).not.toContain("UPDATE erp.rentals");
    expect(reserve).not.toContain("WHERE rental_id = target_rental.id");
  });
  it("uses the established reserve capability and selected-line prerequisites", () => {
    expect(reserve).toContain("current_user_has_permission('rental.update')");
    for (const marker of ["draftPreparation", "assignment_row.status = 'Active'", "contract_row.status = 'Draft'"]) expect(reserve).toContain(marker);
  });

  it("releases only a Reserved line and establishes its effective start", () => {
    expect(release).toContain("<> 'Reserved'");
    expect(release).toContain("canonical_line_status = 'Released'");
    expect(release).toContain("effective_start_date = coalesce(effective_start_date, target_rental.date_out)");
    expect(release).not.toContain("UPDATE erp.rentals");
  });
  it("uses line-specific assignment, operator, project, equipment, and contract validation", () => {
    expect(release).toContain("rental_line_release_readiness");
    for (const marker of ["assignment", "operator", "project", "equipment", "billingTerms"]) expect(readiness).toContain(marker);
  });
  it("captures commercial and DEUR evidence only for the selected line", () => {
    expect(release).toContain("rental_equipment_line_id = target_line.id");
    expect(release).toContain("INSERT INTO erp.commercial_snapshots");
    expect(release).toContain("deurExpectationSnapshot");
    expect(release).toContain("IF NOT EXISTS (SELECT 1 FROM erp.commercial_snapshots");
    expect(release).not.toContain("WHERE rental_id = target_rental.id AND deleted_at IS NULL");
  });

  it("activates only a Released line after canonical operational evidence exists", () => {
    expect(activate).toContain("current_user_has_permission('rental.activate')");
    expect(activate).toContain("<> 'Released'");
    expect(activate).toContain("canonical_line_status = 'Active'");
    expect(activate).toContain("effective_start_date IS NULL");
    expect(activate).toContain("commercial_snapshots");
    expect(activate).not.toContain("UPDATE erp.rentals");
  });

  it("cancels only Draft, Reserved, or Released lines", () => {
    expect(cancel).toContain("IN ('Draft', 'Reserved', 'Released')");
    expect(cancel).toContain("canonical_line_status = 'Cancelled'");
    expect(cancel).toContain("current_user_has_permission('rental.update')");
    expect(cancel).not.toContain("UPDATE erp.rentals");
  });
  it("directs Active lines to Return and keeps final lines immutable", () => {
    expect(cancel).toContain("LINE_CANCEL_ACTIVE_REQUIRES_RETURN");
    expect(cancel).toContain("IN ('Returned', 'Cancelled', 'Closed')");
    expect(cancel).toContain("LINE_CANCEL_NOT_ALLOWED");
  });
  it("protects selected-line billable DEUR evidence without rewriting siblings", () => {
    expect(cancel).toContain("calculate_deur_billing_evidence(deur.id, tenant)");
    expect(cancel).toContain("deur.rental_equipment_line_id = target_line.id");
    expect(cancel).toContain("LINE_CANCEL_BILLABLE_DEUR");
  });

  it("keeps Return line-scoped and narrows the forward source state to Active", () => {
    expect(returning).toContain("<> 'Active'");
    expect(returning).toContain("canonical_line_status = 'Returned'");
    expect(returning).toContain("actual_return_date = return_business_date");
    expect(returning).not.toContain("UPDATE erp.rentals SET");
  });
  it.each([reserve, release, activate, cancel, returning])("uses audit and idempotency without broadening access", (command) => {
    expect(command).toContain("begin_operational_command");
    expect(command).toContain("finish_operational_command");
    expect(command).toContain("INSERT INTO erp.audit_log");
  });
  it("preserves the D5B legacy parent Returned gate", () => {
    expect(d5b1bSql).toContain("legacy_status NOT IN ('Cancelled', 'Closed', 'Returned')");
  });
  it.each([
    [reserve, "rental.update"], [release, "rental.release"], [activate, "rental.activate"], [cancel, "rental.update"], [returning, "rental.return"],
  ])("uses the narrow established capability %s", (command, capability) => {
    expect(command).toContain(`current_user_has_permission('${capability}')`);
  });
  it("is forward-only and leaves D3/D4 conflict functions untouched", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toContain("check_equipment_availability_for_pending_rental");
    expect(sql).not.toContain("enforce_equipment_commitment_intervals");
  });
});
