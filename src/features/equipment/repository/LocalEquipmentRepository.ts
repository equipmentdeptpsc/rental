import type { EquipmentRecord } from "../types";
import type { IEquipmentRepository } from "./IEquipmentRepository";

import { equipmentData } from "../data/equipment.mock";
import { storage } from "@/core/storage";

const STORAGE_KEY = "equipment-records";

export class LocalEquipmentRepository
  implements IEquipmentRepository
{
  private data: EquipmentRecord[];

  constructor() {
    const saved =
      storage.get<EquipmentRecord[]>(STORAGE_KEY);

    if (saved) {
      this.data = saved;
    } else {
      this.data = [...equipmentData];
      this.save();
    }
  }

  private save() {
    storage.set(STORAGE_KEY, this.data);
  }

  getAll(): EquipmentRecord[] {
    return this.data.filter(
      (x) => !x.deleted
    );
  }

  getById(id: string) {
    return this.data.find(
      (x) => x.id === id
    );
  }

  create(item: EquipmentRecord) {
    this.data.push(item);
    this.save();
  }

  update(item: EquipmentRecord) {
    const index =
      this.data.findIndex(
        (x) => x.id === item.id
      );

    if (index >= 0) {
      this.data[index] = item;
      this.save();
    }
  }

  delete(id: string) {
    const equipment =
      this.data.find(
        (x) => x.id === id
      );

    if (!equipment) return;

    equipment.deleted = true;
    equipment.deletedAt = Date.now();

    this.save();
  }
}