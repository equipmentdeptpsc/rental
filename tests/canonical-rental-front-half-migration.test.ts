import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260822000250_canonical_rental_front_half.sql", "utf8");

describe("canonical Rental front-half migration", () => {
  it("defines the intended commands and immutable audit actions", () => {
    for (const command of ["command_create_draft_rental", "command_update_draft_rental_terms", "command_submit_rental_approval", "command_decide_rental_approval", "command_reserve_rental"]) expect(sql).toContain(`FUNCTION erp.${command}`);
    for (const action of ["RENTAL_DRAFT_CREATED", "RENTAL_TERMS_UPDATED", "RENTAL_APPROVAL_SUBMITTED", "RENTAL_APPROVED", "RENTAL_REJECTED", "RENTAL_RESERVED"]) expect(sql).toContain(action);
  });
  it("derives authority and uses only deployed Rental permissions", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("erp.current_company_id()");
    for (const permission of ["rental.manage", "rental.commercialTerms.manage", "rental.approval.submit", "rental.approval.decide", "rental.release"]) expect(sql).toContain(`current_user_has_permission('${permission}')`);
    expect(sql).not.toMatch(/current_user_has_permission\('rental\.(create|update)'\)/);
  });
  it("keeps command execution authenticated-only and adds no table mutation grants", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon,service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated/);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON/i);
  });
  it("does not depend on the excluded P7/P9 migrations", () => {
    expect(sql).not.toMatch(/2026080300(?:77|78|79|80|81|82|83)00/);
    expect(sql).not.toContain("command_prepare_reserved_rental");
  });
  it("keeps approval separate from reservation and enforces a different decision actor", () => {
    const decide = sql.slice(sql.indexOf("CREATE FUNCTION erp.command_decide_rental_approval"), sql.indexOf("CREATE FUNCTION erp.command_reserve_rental"));
    expect(decide).toContain("target.status<>'Draft'");
    expect(decide).toContain("target.approval_status<>'Pending'");
    expect(decide).toContain("actor=target.approval_requested_by");
    expect(decide).toContain("UPDATE erp.rentals SET approval_status=decision");
    expect(decide).not.toMatch(/status='Reserved'|commercial_snapshots|deur_expectation_frequency/);
    const reserve = sql.slice(sql.indexOf("CREATE FUNCTION erp.command_reserve_rental"), sql.indexOf("CREATE FUNCTION erp.command_release_rental"));
    expect(reserve).toContain("target.status<>'Draft' OR target.approval_status<>'Approved'");
    expect(reserve).toContain("SET status='Reserved'");
    expect(reserve).toContain("INSERT INTO erp.commercial_snapshots");
  });
  it("enforces tenant-scoped normalized Rental numbers and classifies unique conflicts truthfully", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS erp\.uq_rentals_number;\s*CREATE UNIQUE INDEX uq_rentals_number\s*ON erp\.rentals\(company_id,lower\(rental_number\)\)/);
    expect(sql).not.toMatch(/ON erp\.rentals\(lower\(rental_number\)\)/);
    expect(sql).toContain("GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME");
    expect(sql).toContain("violated_constraint='uq_rental_lines_company_non_final_equipment'");
    expect(sql).toContain("violated_constraint='uq_rentals_number'");
    expect(sql).toContain("'code','RENTAL_NUMBER_CONFLICT'");
  });
});
