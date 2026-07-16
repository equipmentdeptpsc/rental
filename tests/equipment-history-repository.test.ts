import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import type { EquipmentHistoryRecord } from "@/features/equipment/history/types";

const entry: EquipmentHistoryRecord = {
  id: "history-1",
  equipmentId: "equipment-1",
  type: "RENTED",
  title: "Rental Released",
  description: "Equipment was released.",
  performedBy: "Test User",
  timestamp: "2026-07-17T00:00:00.000Z",
};

describe("equipmentHistoryRepository", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("creates entries and reloads them through a fresh module instance", async () => {
    const { equipmentHistoryRepository } =
      await import("@/features/equipment/history/repository");

    equipmentHistoryRepository.create(entry);
    expect(equipmentHistoryRepository.getAll()).toEqual([entry]);

    vi.resetModules();
    const { equipmentHistoryRepository: reloadedRepository } =
      await import("@/features/equipment/history/repository");

    expect(reloadedRepository.getAll()).toEqual([entry]);
  });
});
