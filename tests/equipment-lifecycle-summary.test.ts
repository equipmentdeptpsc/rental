import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseEquipmentLifecycleSummaryRepository } from "@/integrations/supabase/SupabaseEquipmentLifecycleSummaryRepository";

function client(data: unknown) { return { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ data, error: null })) })) } as never; }

describe("Equipment lifecycle summary boundaries", () => {
  it("preserves maintenance date precision and bounded requests", async () => {
    const repository = new SupabaseEquipmentLifecycleSummaryRepository(client([{ id:"m:Scheduled:2026-09-01", maintenance_record_id:"m", event_type:"Scheduled", occurred_at:"2026-09-01", occurred_at_precision:"date", maintenance_type:"Preventive" }]));
    const result = await repository.getEquipmentMaintenanceLifecycleEvents("equipment", 99);
    expect(result).toMatchObject({ success:true, value:[{ eventType:"Scheduled", occurredAtPrecision:"date" }] });
  });

  it("accepts only explicit DEUR lifecycle facts, never operational events", async () => {
    const repository = new SupabaseEquipmentLifecycleSummaryRepository(client([{ id:"d:Submitted:2026-09-01T00:00:00Z", deur_id:"d", deur_number:"DEUR-1", event_type:"Submitted", occurred_at:"2026-09-01T00:00:00Z", occurred_at_precision:"timestamp" }]));
    const result = await repository.getEquipmentDeurLifecycleEvents("equipment");
    expect(result).toMatchObject({ success:true, value:[{ eventType:"Submitted", occurredAtPrecision:"timestamp" }] });
  });

  it("keeps the SQL boundary permission-scoped, tenant-derived, bounded, and free of inferred timestamps", () => {
    const sql = readFileSync("supabase/migrations/20260905000700_add_equipment_maintenance_deur_lifecycle_history_read.sql", "utf8");
    expect(sql).toContain("current_user_has_permission('maintenance.read')");
    expect(sql).toContain("current_user_has_permission('deur.read')");
    expect(sql).toContain("can_read_company_row");
    expect(sql).toContain("LEAST(20, GREATEST(1, COALESCE(requested_limit, 10)))");
    expect(sql).not.toContain("updated_at");
    expect(sql).not.toContain("deur_events");
  });
});
