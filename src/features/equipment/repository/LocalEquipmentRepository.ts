import type {
  EquipmentRecord,
} from "../types";

import type {
  IEquipmentRepository,
} from "./IEquipmentRepository";

import {
  equipmentData,
} from "../data/equipment.mock";

export class LocalEquipmentRepository
  implements IEquipmentRepository
{
  private data =
    equipmentData;

  getAll() {
    return this.data.filter(
      (item) => !item.deleted
    );
  }

  getDeleted() {
    return this.data.filter(
      (item) => item.deleted
    );
  }

  getById(id: string) {
    return this.data.find(
      (item) => item.id === id
    );
  }

  create(
    equipment: EquipmentRecord
  ) {
    this.data.push(equipment);
  }

  update(
    equipment: EquipmentRecord
  ) {
    const index =
      this.data.findIndex(
        (x) =>
          x.id === equipment.id
      );

    if (index >= 0) {
      this.data[index] =
        equipment;
    }
  }

  delete(id: string) {
    const equipment =
      this.getById(id);

    if (!equipment) return;

    equipment.deleted = true;
  }

  restore(id: string) {
    const equipment =
      this.getById(id);

    if (!equipment) return;

    equipment.deleted = false;
  }

  permanentlyDelete(
    id: string
  ) {
    this.data =
      this.data.filter(
        (x) => x.id !== id
      );
  }
}