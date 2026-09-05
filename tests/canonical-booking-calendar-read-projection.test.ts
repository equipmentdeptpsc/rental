import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SupabaseCanonicalBookingReadRepository } from "@/integrations/supabase/SupabaseCanonicalBookingReadRepository";

const migration = readFileSync("supabase/migrations/20260905001000_booking_calendar_read_projection.sql", "utf8");

describe("canonical Booking calendar read projection", () => {
  it("adds a bounded, tenant-derived calendar RPC without altering the public list contract", () => {
    for (const token of [
      "erp.search_booking_calendar_rows", "erp._search_booking_rows_filtered", "erp._search_booking_rows(",
      "erp.can_read_company_row(rental.company_id)", "current_user_has_permission('rental.read')", "line.deleted_at IS NULL",
      "p_window_start", "p_window_end", "calendar window must not exceed 93 days", "p_window_end - p_window_start > 92",
      "COALESCE(rental.actual_return, rental.expected_return, rental.date_out)", "LEAST(100, GREATEST(1, COALESCE(p_limit, 25)))",
      "OFFSET v_offset", "LIMIT v_limit", "REVOKE ALL ON FUNCTION erp.search_booking_calendar_rows", "TO authenticated",
    ]) expect(migration).toContain(token);
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth, pg_catalog");
    expect(migration).toContain("RETURN QUERY SELECT * FROM erp._search_booking_rows_filtered(");
    expect(migration).not.toMatch(/company_id\s+(?:text|uuid)\s*(?:DEFAULT)?/i);
    expect(migration).not.toMatch(/INSERT INTO|UPDATE erp\.|DELETE FROM|CREATE TABLE[^;]*booking/i);
  });

  it("sends a date-only bounded calendar request with the established filters and paging", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ rental_id: "r1", rental_number: "R-1", rental_status: "Active", rental_equipment_line_id: "l1", equipment_id: "e1", date_out: "2026-09-01", created_at: "2026-09-01T00:00:00Z", total_count: 2 }], error: null });
    const repository = new SupabaseCanonicalBookingReadRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const result = await repository.searchCanonicalBookingCalendarRows({ windowStart: "2026-09-01", windowEnd: "2026-09-30", status: "Active", customerId: "c1", projectId: "p1", equipmentId: "e1", rentalNumberSearch: "R-", limit: 200, offset: -1 });
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("search_booking_calendar_rows", expect.objectContaining({
      p_window_start: "2026-09-01", p_window_end: "2026-09-30", p_status: "Active", p_customer_id: "c1", p_project_id: "p1", p_equipment_id: "e1", p_rental_number_search: "R-", p_order_field: "dateOut", p_order_ascending: true, p_offset: 0, p_limit: 100,
    }));
    if (result.success) expect(result.value).toMatchObject({ totalCount: 2, hasMore: true, rows: [{ rentalEquipmentLineId: "l1", dateOut: "2026-09-01" }] });
  });

  it("rejects invalid and oversized windows before any remote request", async () => {
    const rpc = vi.fn();
    const repository = new SupabaseCanonicalBookingReadRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    for (const input of [
      { windowStart: "2026-09-02", windowEnd: "2026-09-01" },
      { windowStart: "2026-09-01", windowEnd: "2026-12-03" },
      { windowStart: "2026-02-30", windowEnd: "2026-03-01" },
    ]) {
      const result = await repository.searchCanonicalBookingCalendarRows(input);
      expect(result.success).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
