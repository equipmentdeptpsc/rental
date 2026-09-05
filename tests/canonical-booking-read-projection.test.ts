import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SupabaseCanonicalBookingReadRepository } from "@/integrations/supabase/SupabaseCanonicalBookingReadRepository";

const migration = readFileSync("supabase/migrations/20260905000800_canonical_booking_read_projection.sql", "utf8");

describe("canonical Booking read projection", () => {
  it("is a bounded, tenant-derived Rental Equipment Line RPC without a Booking entity", () => {
    for (const token of ["erp.search_booking_rows", "rental_equipment_lines", "rental_id", "rental_equipment_line_id", "erp.can_read_company_row(rental.company_id)", "current_user_has_permission('rental.read')", "line.deleted_at IS NULL", "LEAST(100, GREATEST(1, COALESCE(p_limit, 25)))", "OFFSET v_offset", "LIMIT v_limit", "rental_equipment_line_id DESC", "REVOKE ALL", "TO authenticated"]) expect(migration).toContain(token);
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, auth, pg_catalog");
    expect(migration).not.toMatch(/booking_id|CREATE TABLE[^;]*booking/i);
    expect(migration).not.toMatch(/INSERT INTO|UPDATE erp\.|DELETE FROM/);
  });

  it("requires qualified ordering in the forward correction", () => {
    const correction = readFileSync("supabase/migrations/20260905000900_fix_canonical_booking_read_projection_ordering.sql", "utf8");
    expect(correction).toContain("counted.created_at");
    expect(correction).toContain("counted.rental_equipment_line_id DESC");
    expect(correction).toContain("REVOKE ALL ON FUNCTION erp._search_booking_rows");
  });

  it("sends bounded canonical filters and ordering to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ rental_id: "r1", rental_number: "R-1", rental_status: "Reserved", rental_equipment_line_id: "l1", equipment_id: "e1", date_out: "2026-09-05", created_at: "2026-09-05T01:00:00Z", total_count: 2 }], error: null });
    const repository = new SupabaseCanonicalBookingReadRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const result = await repository.searchCanonicalBookingRows({ status: "Reserved", customerId: "c1", projectId: "p1", equipmentId: "e1", rentalNumberSearch: "R-", sort: "dateOut", ascending: true, offset: -9, limit: 200 });
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("search_booking_rows", expect.objectContaining({ p_status: "Reserved", p_customer_id: "c1", p_project_id: "p1", p_equipment_id: "e1", p_rental_number_search: "R-", p_order_field: "dateOut", p_order_ascending: true, p_offset: 0, p_limit: 100 }));
    if (result.success) expect(result.value).toMatchObject({ totalCount: 2, hasMore: true, rows: [{ rentalEquipmentLineId: "l1", rentalStatus: "Reserved" }] });
  });
});
