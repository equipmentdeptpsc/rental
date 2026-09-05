import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { resolveEquipmentMaintenanceSnapshot, type CanonicalMaintenanceRecord } from "@/features/maintenance/canonical";
import { SupabaseEquipmentMaintenanceSnapshotRepository } from "@/integrations/supabase/SupabaseEquipmentMaintenanceSnapshotRepository";

const migration = readFileSync("supabase/migrations/20260905000500_add_tenant_safe_equipment_maintenance_read.sql", "utf8");
const detailHook = readFileSync("src/features/equipment/hooks/useCanonicalEquipmentDetail.ts", "utf8");
const detailPage = readFileSync("src/pages/Equipment/Details.tsx", "utf8");

const record = (overrides: Partial<CanonicalMaintenanceRecord>): CanonicalMaintenanceRecord => ({ id: "maintenance-1", equipmentId: "equipment-1", maintenanceType: "Preventive", scheduledReading: 100, currentReading: 75, scheduledDate: "2026-09-10", technician: "Technician", remarks: "", status: "Scheduled", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", ...overrides });

describe("Equipment Maintenance snapshot", () => {
  it("uses the canonical open and latest-completed semantics deterministically", () => {
    const snapshot = resolveEquipmentMaintenanceSnapshot([
      record({ id: "deleted-is-never-passed-to-selector", status: "Completed", completedDate: "2026-09-30" }),
      record({ id: "scheduled", status: "Scheduled", scheduledDate: "2026-09-05" }),
      record({ id: "in-progress", status: "In Progress", scheduledDate: "2026-09-20" }),
      record({ id: "completed-old", status: "Completed", completedDate: "2026-09-01", updatedAt: "2026-09-03T00:00:00Z" }),
      record({ id: "completed-latest", status: "Completed", completedDate: "2026-09-02", updatedAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(snapshot.openRecords.map((item) => item.id)).toEqual(["in-progress", "scheduled"]);
    expect(snapshot.latestCompleted?.id).toBe("deleted-is-never-passed-to-selector");
  });

  it("maps only the bounded RPC snapshot response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { open_records: [{ id: "open", equipment_id: "equipment-1", maintenance_type: "Preventive", scheduled_reading: 100, current_reading: 75, scheduled_date: "2026-09-10", technician: "A", remarks: "Check hose", status: "Scheduled", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }], latest_completed: null }, error: null });
    const repository = new SupabaseEquipmentMaintenanceSnapshotRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    await expect(repository.getEquipmentMaintenanceSnapshot("equipment-1")).resolves.toMatchObject({ success: true, value: { openRecords: [{ id: "open", status: "Scheduled" }] } });
    expect(rpc).toHaveBeenCalledWith("get_equipment_maintenance_snapshot", { target_equipment_id: "equipment-1" });
  });

  it("keeps the secure RPC as the only authenticated Maintenance read boundary", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("erp.can_read_company_row(equipment.company_id)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.get_equipment_maintenance_snapshot(text) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.get_equipment_maintenance_snapshot(text) TO authenticated");
    expect(migration).not.toContain("GRANT SELECT ON erp.maintenance_records TO authenticated");
    expect(migration).toContain("maintenance.deleted_at IS NULL");
    expect(migration).toContain("maintenance.status IN ('Scheduled', 'In Progress')");
    expect(migration).toContain("maintenance.completed_date DESC NULLS LAST");
  });

  it("loads Maintenance only from the Equipment detail hook and gates the section", () => {
    expect(detailHook).toContain('hasPermission("maintenance.read")');
    expect(detailHook).toContain("readRepositories.maintenance.getEquipmentMaintenanceSnapshot(id)");
    expect(detailHook).not.toContain("maintenanceRepository");
    expect(detailPage).toContain("Maintenance Snapshot");
    expect(detailPage).toContain("No open maintenance");
    expect(detailPage).toContain("No completed maintenance record");
    expect(detailPage).not.toContain("Work Order number");
  });
});
