import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914000400_line_effective_booking_intervals.sql", "utf8");
const assertInterval = sql.slice(sql.indexOf("FUNCTION erp.assert_equipment_interval_available"), sql.indexOf("FUNCTION erp.enforce_rental_line_commitment_interval"));
const commitments = sql.slice(sql.indexOf("FUNCTION erp._equipment_commitment_rows"), sql.indexOf("FUNCTION erp._search_booking_rows_v2"));
const booking = sql.slice(sql.indexOf("FUNCTION erp._search_booking_rows_v2"));
const lineInterval = (effectiveStart: string | undefined, parentStart: string, actualReturn: string | undefined, parentEnd: string | undefined) => ({
  start: effectiveStart ?? parentStart,
  end: actualReturn ?? parentEnd,
});
const overlaps = (left: { start: string; end?: string }, right: { start: string; end?: string }) =>
  (right.end === undefined || left.start <= right.end) && (left.end === undefined || right.start <= left.end);

describe("D5B2 line-effective booking intervals", () => {
  it("defines the line start with a legacy-only parent fallback", () => {
    expect(sql).toContain("FUNCTION erp.rental_line_commitment_start");
    expect(sql).toContain("coalesce(p_effective_start_date, p_parent_date_out)");
  });
  it("defines the line end from actual return before parent expected return", () => {
    expect(sql).toContain("FUNCTION erp.rental_line_commitment_end");
    expect(sql).toContain("coalesce(p_actual_return_date, p_parent_expected_return)");
  });
  it("preserves a new Rental line's parent-date start when no later start exists", () => {
    expect(lineInterval(undefined, "2026-09-01", undefined, "2026-09-30")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });
  it("keeps the legacy null-effective-start fallback compatible", () => {
    expect(lineInterval(undefined, "2026-09-01", undefined, undefined).start).toBe("2026-09-01");
  });
  it("does not backdate a later line before its effective start", () => {
    expect(overlaps(lineInterval("2026-09-10", "2026-09-01", undefined, "2026-09-30"), { start: "2026-09-01", end: "2026-09-09" })).toBe(false);
  });
  it("conflicts once a requested interval reaches the later effective start", () => {
    expect(overlaps(lineInterval("2026-09-10", "2026-09-01", undefined, "2026-09-30"), { start: "2026-09-10", end: "2026-09-11" })).toBe(true);
  });
  it("does not let a sibling's earlier start alter a different line interval", () => {
    expect(lineInterval("2026-09-10", "2026-09-01", undefined, "2026-09-30").start).toBe("2026-09-10");
  });
  it("uses actual return as the finite interval end", () => {
    expect(lineInterval("2026-09-01", "2026-09-01", "2026-09-10", "2026-09-30").end).toBe("2026-09-10");
  });
  it("does not conflict after the actual return", () => {
    expect(overlaps(lineInterval("2026-09-01", "2026-09-01", "2026-09-10", "2026-09-30"), { start: "2026-09-11", end: "2026-09-12" })).toBe(false);
  });
  it("preserves the inclusive actual-return endpoint", () => {
    expect(overlaps(lineInterval("2026-09-01", "2026-09-01", "2026-09-10", "2026-09-30"), { start: "2026-09-10", end: "2026-09-10" })).toBe(true);
  });
  it("keeps an unset parent end open-ended", () => {
    expect(overlaps(lineInterval("2026-09-10", "2026-09-01", undefined, undefined), { start: "2031-01-01", end: "2031-01-02" })).toBe(true);
  });
  it("keeps a null line end open-ended without a sentinel", () => {
    expect(sql).toContain("'infinity'::date");
    expect(sql).not.toContain("9999");
  });
  it.each(["Draft", "Reserved", "Released", "Active"])("treats %s lines as committing", (status) => expect(sql).toContain(`'${status}'`));
  it.each(["Returned", "Cancelled"])("does not list final %s lines as committing", (status) => {
    expect(sql.slice(sql.indexOf("FUNCTION erp.rental_line_is_committing"), sql.indexOf("-- D3:"))).not.toContain(`IN ('Draft', 'Reserved', 'Released', 'Active', '${status}')`);
  });
  it("keeps legacy Assigned compatibility without mapping terminal parents into commitments", () => {
    expect(sql).toContain("p_canonical_line_status IS NULL AND p_legacy_line_status = 'Assigned'");
    expect(sql).toContain("p_canonical_parent_status IS NULL AND p_legacy_parent_status = 'Assigned'");
    expect(sql).not.toContain("p_legacy_parent_status = 'Returned'");
  });
  it("uses the line interval for Rental-to-Rental and Rental-to-Assignment enforcement", () => {
    expect(assertInterval).toContain("rental_line_commitment_start(line.effective_start_date, rental.date_out)");
    expect(assertInterval).toContain("rental_line_commitment_end(line.actual_return_date, rental.expected_return)");
    expect(assertInterval).toContain("assignment.assigned_date, assignment.expected_return");
  });
  it("keeps Assignment-to-Assignment intervals unchanged", () => expect(assertInterval).toContain("assignment.assigned_date, assignment.expected_return"));
  it("uses the exact persisted line interval in the linked Assignment exclusion", () => {
    expect(assertInterval).toContain("line.assignment_id = assignment.id");
    expect(assertInterval).toContain("rental_line_is_committing(line.status, line.canonical_line_status");
    expect(sql).toContain("assignment.assigned_date = line_start");
    expect(sql).toContain("assignment.expected_return IS NOT DISTINCT FROM line_end");
    expect(sql).toContain("NEW.id, exact_source_assignment_id");
  });
  it("enforces the persisted line interval on relevant line updates", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF rental_id, equipment_id, status, canonical_line_status, effective_start_date, actual_return_date, deleted_at");
    expect(sql).toContain("NEW.effective_start_date, rental.date_out");
  });
  it("uses equipment-specific line rows rather than parent-wide blocking", () => {
    expect(commitments).toContain("line.equipment_id");
    expect(commitments).toContain("line.id");
    expect(commitments).not.toContain("WHERE rental.id =");
  });
  it("applies the terminal parent gate to D4 commitments", () => expect(commitments).toContain("rental_line_is_committing(line.status, line.canonical_line_status, rental.status, rental.canonical_parent_status)"));
  it("keeps ordinary and relationship-aware D4 contracts candidate-interval neutral", () => {
    expect(sql).toContain("Candidate D4 start/end parameters remain caller-neutral");
    expect(sql).not.toContain("command_add_rental_equipment_line");
  });
  it("keeps the established relationship-aware RPC and exact source exemption available", () => {
    const previous = readFileSync("supabase/migrations/20260911000400_support_open_ended_equipment_availability_read.sql", "utf8");
    expect(previous).toContain("check_equipment_availability_for_pending_rental");
    expect(previous).toContain("assignment.assigned_date = p_window_start");
    expect(previous).toContain("assignment.expected_return IS NOT DISTINCT FROM p_window_end");
  });
  it("uses line intervals for calendar, expected-return, and upcoming-release booking rows", () => {
    expect(booking).toContain("erp.rental_line_commitment_start(line.effective_start_date, rental.date_out) date_out");
    expect(booking).toContain("erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) expected_return");
    expect(booking).toContain("BETWEEN p_window_start AND p_window_end");
  });
  it("does not change D3/D4 RPC signatures or add an Add Equipment command", () => {
    expect(sql).not.toContain("check_equipment_availability(");
    expect(sql).not.toContain("command_add");
  });
  it("is forward-only", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
