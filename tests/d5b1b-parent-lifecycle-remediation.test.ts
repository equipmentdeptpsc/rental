import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { RentalRecord } from "@/features/rental/types";
import { canEditRental } from "@/features/rental/services/RentalWorkflowRules";

const sql = readFileSync("supabase/migrations/20260914000200_parent_rental_terminal_lifecycle_remediation.sql", "utf8");
const returnSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_return_rental_line"), sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_return_all_rental_lines"));
const cancelSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_cancel_rental"), sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_close_rental"));
const closeSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_close_rental"));
const readinessSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.get_rental_closure_readiness"), sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_return_rental_line"));

const rental = (status: RentalRecord["status"]) => ({ status } as RentalRecord);

describe("D5B1B parent lifecycle remediation", () => {
  it("returns one line without changing the parent", () => {
    expect(returnSection).toContain("canonical_line_status = 'Returned'");
    expect(returnSection).toContain("Parent status is intentionally untouched");
    expect(returnSection).not.toContain("UPDATE erp.rentals AS r SET status = 'Returned'");
  });

  it("keeps the parent out of the new Returned lifecycle", () => {
    expect(sql).not.toContain("canonical_parent_status = 'Returned'");
    expect(sql).toContain("historical Returned Rentals are read-only");
  });

  it("preserves the authoritative line return date and existing operational cleanup", () => {
    expect(returnSection).toContain("actual_return_date = return_business_date");
    expect(returnSection).toContain("UPDATE erp.assignments assignment_row");
    expect(returnSection).toContain("UPDATE erp.equipment equipment_row");
  });

  it("blocks cancellation when a non-deleted canonical Active line exists", () => {
    expect(cancelSection).toContain("line.deleted_at IS NULL");
    expect(cancelSection).toContain("PARENT_CANCEL_ACTIVE_EQUIPMENT");
    expect(cancelSection).toContain("canonical_line_status::text, line.status::text");
  });

  it("uses the canonical billing-evidence helper for Parent Cancel", () => {
    expect(cancelSection).toContain("calculate_deur_billing_evidence(deur.id, tenant)");
    expect(cancelSection).toContain("PARENT_CANCEL_BILLABLE_DEUR");
  });

  it("cascades open non-active line states and preserves terminal history", () => {
    expect(cancelSection).toContain("IN ('Draft', 'Assigned', 'Reserved', 'Released')");
    expect(cancelSection).toContain("status = 'Cancelled', canonical_line_status = 'Cancelled'");
    expect(cancelSection).not.toContain("IN ('Returned', 'Cancelled')");
  });

  it("makes Parent Cancel atomic through one command transaction", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(cancelSection).toContain("FOR UPDATE");
    expect(cancelSection).toContain("finish_operational_command(command, 'CANCEL_RENTAL'");
  });

  it("uses one canonical parent read-only gate", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.rental_parent_is_mutable");
    expect(sql).toContain("legacy_status NOT IN ('Cancelled', 'Closed', 'Returned')");
    expect(returnSection).toContain("rental_parent_is_mutable");
    expect(cancelSection).toContain("rental_parent_is_mutable");
    expect(closeSection).toContain("rental_parent_is_mutable");
  });

  it("makes Cancelled and Closed locally read-only while keeping history readable", () => {
    expect(canEditRental(rental("Cancelled"))).toBe(false);
    expect(canEditRental(rental("Closed"))).toBe(false);
    expect(canEditRental(rental("Returned"))).toBe(false);
    expect(canEditRental(rental("Active"))).toBe(true);
  });

  it("uses final-line, assignment, incomplete-DEUR, and financial Close gates", () => {
    for (const marker of ["LINE_NOT_FINAL", "ASSIGNMENT_ACTIVE", "DEUR_INCOMPLETE", "DEUR_BILLING_UNRESOLVED", "calculate_deur_billing_evidence(deur.id, tenant)"]) {
      expect(readinessSection).toContain(marker);
    }
  });

  it("closes explicitly without rewriting Returned or Cancelled child history", () => {
    expect(closeSection).toContain("canonical_parent_status = 'Closed'");
    expect(closeSection).toContain("Parent Close preserves Returned and Cancelled line history");
    expect(closeSection).not.toContain("UPDATE erp.rental_equipment_lines");
  });

  it("retains existing narrow command authorization", () => {
    expect(returnSection).toContain("current_user_has_permission('rental.return')");
    expect(cancelSection).toContain("current_user_has_permission('rental.update')");
    expect(closeSection).toContain("current_user_has_permission('rental.close')");
  });

  it("is forward-only and does not modify D3 or D4 functions", () => {
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DELETE FROM");
    expect(sql).not.toContain("check_equipment_availability_for_pending_rental");
    expect(sql).not.toContain("enforce_equipment_commitment_intervals");
    expect(sql).toContain("COMMIT;");
  });
});
