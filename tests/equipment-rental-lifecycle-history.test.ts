import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SupabaseEquipmentRentalLifecycleHistoryRepository } from "@/integrations/supabase/SupabaseEquipmentRentalLifecycleHistoryRepository";

const migration = readFileSync("supabase/migrations/20260905000600_add_equipment_rental_lifecycle_history_read.sql", "utf8");

describe("Equipment Rental lifecycle history", () => {
  it("maps only authoritative RPC events and clamps the request limit", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "rental-1:Returned:2026-09-05T00:00:00Z", rental_id: "rental-1", rental_number: "RENT-001", event_type: "Returned", occurred_at: "2026-09-05T00:00:00Z", customer_id: "customer-1" }], error: null });
    const repository = new SupabaseEquipmentRentalLifecycleHistoryRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    await expect(repository.getEquipmentRentalLifecycleEvents("equipment-1", 999)).resolves.toMatchObject({ success: true, value: [{ eventType: "Returned", rentalNumber: "RENT-001" }] });
    expect(rpc).toHaveBeenCalledWith("get_equipment_rental_lifecycle_events", { target_equipment_id: "equipment-1", requested_limit: 20 });
  });

  it("fails closed when the secure projection is malformed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "bad", rental_id: "rental-1", event_type: "Invented", occurred_at: "2026-09-05T00:00:00Z" }], error: null });
    const repository = new SupabaseEquipmentRentalLifecycleHistoryRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    await expect(repository.getEquipmentRentalLifecycleEvents("equipment-1")).resolves.toMatchObject({ success: false, error: { code: "REMOTE_ROW_MALFORMED" } });
  });

  it("keeps the secure boundary tenant-derived, permission-gated, bounded, and read-only", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("erp.can_read_company_row(equipment.company_id)");
    expect(migration).toContain("erp.current_user_has_permission('rental.read')");
    expect(migration).toContain("line.deleted_at IS NULL");
    expect(migration).toContain("LIMIT LEAST(20, GREATEST(1, COALESCE(requested_limit, 10)))");
    expect(migration).toContain("ORDER BY event.occurred_at DESC, event.id DESC");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) TO authenticated");
    expect(migration).not.toContain("company_id text");
    expect(migration).not.toContain("GRANT SELECT ON erp.rentals TO authenticated");
    expect(migration).not.toContain("INSERT INTO");
    expect(migration).not.toContain("UPDATE ");
    expect(migration).not.toContain("DELETE FROM");
  });

  it("emits only the six authoritative lifecycle timestamps and deduplicates line fan-out before event expansion", () => {
    for (const eventType of ["Reserved", "Released", "Activated", "Returned", "Closed", "Cancelled"]) expect(migration).toContain(`'${eventType}'::text`);
    expect(migration).toContain("SELECT DISTINCT rental.id");
    expect(migration).not.toContain("rental.created_at");
    expect(migration).not.toContain("rental.updated_at");
    expect(migration).not.toContain("rental.status");
  });
});
