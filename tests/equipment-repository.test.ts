import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
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

  it("keeps transactional Equipment empty when storage is empty", () => {
    const repository = new LocalEquipmentRepository();

    expect(repository.getAll()).toEqual([]);
    expect(repository.getDeleted()).toEqual([]);
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

  it("persists and updates an optional Cost Code reference", () => {
    const repository = new LocalEquipmentRepository();
    const created = {
      ...equipment("cost-coded"),
      costCodeId: "cost-code-heavy",
    };

    repository.create(created);
    expect(new LocalEquipmentRepository().getById(created.id)?.costCodeId)
      .toBe("cost-code-heavy");

    repository.update({ ...created, costCodeId: "cost-code-light" });
    expect(new LocalEquipmentRepository().getById(created.id)?.costCodeId)
      .toBe("cost-code-light");
  });

  it("enforces required, case-insensitive Equipment Code uniqueness at the repository boundary", () => {
    const repository = new LocalEquipmentRepository();
    repository.create({ ...equipment("one"), equipmentName: "EXC-OPS-01" });
    expect(() => repository.create({ ...equipment("two"), equipmentName: " exc-ops-01 " })).toThrow("Equipment Code already exists.");
    expect(() => repository.create({ ...equipment("blank"), equipmentName: " " })).toThrow("Equipment Code is required.");
  });

  it("loads and reserializes legacy Equipment without a Cost Code", () => {
    const legacy = equipment("legacy");
    storage.set(STORAGE_KEY, [legacy]);

    const repository = new LocalEquipmentRepository();
    expect(repository.getById(legacy.id)?.costCodeId).toBeUndefined();

    repository.update({ ...legacy, equipmentName: "Updated legacy equipment" });
    expect(storage.get<EquipmentRecord[]>(STORAGE_KEY)).toEqual([
      expect.objectContaining({
        id: legacy.id,
        equipmentName: "Updated legacy equipment",
      }),
    ]);
    expect(storage.get<EquipmentRecord[]>(STORAGE_KEY)?.[0].costCodeId)
      .toBeUndefined();
  });
});
