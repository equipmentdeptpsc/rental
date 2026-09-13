import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SupabaseEquipmentAvailabilityRepository } from "@/integrations/supabase/SupabaseEquipmentAvailabilityRepository";

const migration = readFileSync("supabase/migrations/20260906000200_equipment_availability_conflict_read.sql", "utf8");

describe("canonical equipment availability conflict read foundation", () => {
  it("adds nullable per-line actual-return evidence without a historical backfill or return-command change", () => {
    expect(migration).toContain("ADD COLUMN actual_return_date date NULL");
    expect(migration).not.toMatch(/UPDATE\s+erp\.rental_equipment_lines/i);
    expect(migration).not.toContain("command_return_rental_line");
  });

  it("projects the exact eligible Rental statuses and inclusive actual-return interval", () => {
    for (const status of ["'Draft'", "'Assigned'", "'Reserved'", "'Released'", "'Active'"]) expect(migration).toContain(status);
    expect(migration).toContain("COALESCE(line.actual_return_date, rental.expected_return)");
    expect(migration).toContain("commitment.commitment_start <= p_window_end");
    expect(migration).toContain("commitment.commitment_end IS NULL OR commitment.commitment_end >= p_window_start");
  });

  it("excludes final Rental statuses and Rental-linked Assignments from standalone commitments", () => {
    for (const status of ["'Returned'", "'Closed'", "'Cancelled'"]) expect(migration).not.toMatch(new RegExp(`line\\.status IN \\([^)]*${status}`));
    expect(migration).toContain("AND NOT EXISTS (");
    expect(migration).toContain("line.assignment_id = assignment.id");
    expect(migration).toContain("line.equipment_id = assignment.equipment_id");
  });

  it("is tenant-derived, permission-redacted, bounded, and excludes maintenance", () => {
    for (const token of ["erp.can_read_company_row(line.company_id)", "equipment.read permission is required", "v_can_rental", "v_can_assignment", "'RESTRICTED'", "customer.read permission is required to filter by customer", "availability window must not exceed 93 days", "LEAST(100, GREATEST(1, COALESCE(p_limit, 25)))", "OFFSET v_offset LIMIT v_limit"]) expect(migration).toContain(token);
    expect(migration).not.toMatch(/maintenance_records|maintenance\.read/i);
  });

  it("keeps private commitment data non-callable and exposes only authenticated read RPCs", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp._equipment_commitment_rows() FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.check_equipment_availability(text, date, date) TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.search_equipment_commitment_conflicts(date, date, text, text, text, integer, integer) TO authenticated");
  });

  it("uses the canonical ERP RPC client and bounds invalid client windows before transport", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ equipment_id: "e1", available: true, conflict_count: 0 }], error: null });
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const invalid = await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2026-09-01", windowEnd: "2026-12-03" });
    expect(invalid.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const result = await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2026-09-01", windowEnd: "2026-09-01" });
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_equipment_availability", { p_equipment_id: "e1", p_window_start: "2026-09-01", p_window_end: "2026-09-01" });
  });

  it("maps only safe public search fields and delegates server-side pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ equipment_id: "e1", equipment_asset_number: "EQ-1", source_type: "RESTRICTED", total_count: 1 }], error: null });
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const result = await repository.searchEquipmentCommitments({ windowStart: "2026-09-01", windowEnd: "2026-09-05", offset: 2, limit: 200 });
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("search_equipment_commitment_conflicts", expect.objectContaining({ p_offset: 2, p_limit: 100 }));
  });

  it("uses the relationship-aware RPC only when explicit source Assignment context is supplied", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ equipment_id: "e1", available: true, conflict_count: 0 }], error: null });
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const result = await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2026-09-01", windowEnd: "2026-09-05", sourceAssignmentId: "a1" });
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_equipment_availability_for_pending_rental", {
      p_equipment_id: "e1", p_window_start: "2026-09-01", p_window_end: "2026-09-05", p_source_assignment_id: "a1",
    });
    expect(rpc).not.toHaveBeenCalledWith("check_equipment_availability", expect.anything());
  });

  it("preserves canonical result mapping and remote error handling for the new RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ equipment_id: "e1", available: false, conflict_count: 1, source_type: "ASSIGNMENT", commitment_start: "2026-09-01", commitment_end: null, is_open_ended: true }], error: null });
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const result = await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2026-09-01", windowEnd: "2026-09-05", sourceAssignmentId: "a1" });
    expect(result.success && result.value.conflicts[0]).toMatchObject({ sourceType: "ASSIGNMENT", commitmentStart: "2026-09-01", isOpenEnded: true });
    const failed = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("read failed") }) })) } as never);
    expect((await failed.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2026-09-01", windowEnd: "2026-09-05", sourceAssignmentId: "a1" })).success).toBe(false);
  });
});
