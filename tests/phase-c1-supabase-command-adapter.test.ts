import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { repositorySuccess } from "@/core/persistence";
import { SupabaseDeurCommandRepository } from "@/integrations/supabase/SupabaseDeurCommandRepository";
import type { DeurRecord } from "@/features/rental/deur/types";

const record: DeurRecord = {
  id: "deur-1", rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1",
  operatorId: "operator-1", assignmentId: "assignment-1", creationSource: "OPERATOR_DIGITAL",
  workDate: "2026-07-29", shift: "Day", events: [], logs: [], totalOperatingMinutes: 0,
  totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
  totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "In Progress",
  billingLocked: false, createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z",
};
const input = {
  commandId: "command-1", idempotencyKey: "key-1", rentalId: record.rentalId,
  rentalLineId: record.rentalEquipmentLineId!, equipmentId: record.equipmentId,
  operatorId: record.operatorId, assignmentId: record.assignmentId!, deurId: record.id,
  expectedVersion: 1, clientCreatedAt: "1999-01-01T00:00:00.000Z", action: "START_IDLE" as const,
};

describe("Supabase DEUR command adapter", () => {
  it("keeps the RPC boundary inside the adapter and performs read-after-write refresh", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", record: { ...record, rental_id: record.rentalId, row_version: 2 }, version: 2, serverOccurredAt: "2026-07-29T01:00:00.000Z" }, error: null }));
    const refreshed = { ...record, updatedAt: "2026-07-29T01:00:00.000Z" };
    const reads = { getById: vi.fn(async () => repositorySuccess(refreshed)), list: vi.fn(), search: vi.fn() };
    const client = { schema: vi.fn(() => ({ rpc })) } as unknown as SupabaseClient;
    const repository = new SupabaseDeurCommandRepository(client, reads);
    await expect(repository.startOrChangeActivity(input)).resolves.toMatchObject({ success: true, version: 2, record: { updatedAt: refreshed.updatedAt } });
    expect(rpc).toHaveBeenCalledWith("command_transition_deur_activity", { command: input });
    expect(reads.getById).toHaveBeenCalledWith(record.id);
  });

  it("preserves typed conflicts and safe transport uncertainty", async () => {
    const conflictClient = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: { success: false, code: "CONFLICT", aggregateId: record.id, expectedVersion: 1, currentVersion: 2, refreshRequired: true }, error: null })) })) } as unknown as SupabaseClient;
    await expect(new SupabaseDeurCommandRepository(conflictClient).startOrChangeActivity(input)).resolves.toMatchObject({ success: false, code: "CONFLICT", expectedVersion: 1, currentVersion: 2, refreshRequired: true });
    const transportClient = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: null, error: { message: "network unavailable" } })) })) } as unknown as SupabaseClient;
    await expect(new SupabaseDeurCommandRepository(transportClient).startOrChangeActivity(input)).resolves.toMatchObject({ success: false, code: "TRANSPORT_FAILURE", retryable: true, refreshRequired: false });
  });
});
