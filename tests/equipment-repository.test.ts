import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import { equipmentData } from "@/features/equipment/data/equipment.mock";
import { LocalEquipmentRepository } from "@/features/equipment/repository/LocalEquipmentRepository";
import type { EquipmentRecord } from "@/features/equipment/types";

const STORAGE_KEY = "equipment-records";

function equipment(id: string): EquipmentRecord {
  return {
    id,
    prefixId: "test",
    assetNo: `EQ-${id}`,
    equipmentName: "Test Equipment",
    category: "Moving Equipment",
    maintenanceType: "Engine Hours",
    currentReading: 0,
    projectId: "",
    operatorId: "",
    status: "Available",
    deleted: false,
  };
}

describe("LocalEquipmentRepository", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("loads the seed records when storage is empty", () => {
    const repository = new LocalEquipmentRepository();

    expect(repository.getAll()).toHaveLength(equipmentData.length);
    expect(repository.getAll().map((item) => item.assetNo))
      .toEqual(equipmentData.map((item) => item.assetNo));
  });

  it("persists create, update, status, project, operator, delete, restore, and permanent delete", () => {
    const repository = new LocalEquipmentRepository();
    const created = equipment("persisted-equipment");

    repository.create(created);
    expect(new LocalEquipmentRepository().getById(created.id)).toEqual(created);

    const updated = {
      ...created,
      status: "Rented" as const,
      projectId: "project-1",
      operatorId: "operator-1",
    };
    repository.update(updated);

    expect(new LocalEquipmentRepository().getById(created.id)).toMatchObject({
      status: "Rented",
      projectId: "project-1",
      operatorId: "operator-1",
    });

    repository.delete(created.id);
    expect(new LocalEquipmentRepository().getAll().find((item) => item.id === created.id))
      .toBeUndefined();
    expect(new LocalEquipmentRepository().getDeleted().find((item) => item.id === created.id))
      .toMatchObject({ deleted: true });

    repository.restore(created.id);
    expect(new LocalEquipmentRepository().getById(created.id))
      .toMatchObject({ deleted: false, status: "Rented" });

    repository.permanentlyDelete(created.id);
    expect(new LocalEquipmentRepository().getById(created.id)).toBeUndefined();
    expect(storage.get<EquipmentRecord[]>(STORAGE_KEY)?.find((item) => item.id === created.id))
      .toBeUndefined();
  });
});
