import type {
  EquipmentRecord,
} from "../types";

import type {
  IEquipmentRepository,
} from "./IEquipmentRepository";

import { storage } from "@/core/storage";

const STORAGE_KEY = "equipment-records";

export class LocalEquipmentRepository
  implements IEquipmentRepository
{
  private data: EquipmentRecord[];

  constructor() {
    this.data =
      storage.get<EquipmentRecord[]>(STORAGE_KEY) ??
      [];
  }

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
    this.assertEquipmentCodeAvailable(equipment);
    if(this.data.some(item=>item.id!==equipment.id&&item.assetNo.trim().toLowerCase()===equipment.assetNo.trim().toLowerCase()))throw new Error("Asset Number already exists.");
    this.data.push(equipment);
    this.save();
  }

  update(
    equipment: EquipmentRecord
  ) {
    this.assertEquipmentCodeAvailable(equipment);
    if(this.data.some(item=>item.id!==equipment.id&&item.assetNo.trim().toLowerCase()===equipment.assetNo.trim().toLowerCase()))throw new Error("Asset Number already exists.");
    const index =
      this.data.findIndex(
        (x) =>
          x.id === equipment.id
      );

    if (index >= 0) {
      this.data[index] =
        equipment;
      this.save();
    }
  }

  delete(id: string) {
    const equipment =
      this.getById(id);

    if (!equipment) return;

    equipment.deleted = true;
    this.save();
  }

  restore(id: string) {
    const equipment =
      this.getById(id);

    if (!equipment) return;

    equipment.deleted = false;
    this.save();
  }

  permanentlyDelete(
    id: string
  ) {
    this.data =
      this.data.filter(
        (x) => x.id !== id
      );

    this.save();
  }

  private save() {
    storage.set(STORAGE_KEY, this.data);
  }

  private assertEquipmentCodeAvailable(equipment: EquipmentRecord) {
    if (!equipment.equipmentName.trim()) throw new Error("Equipment Code is required.");
    if (this.data.some((item) => item.id !== equipment.id && item.equipmentName.trim().toLocaleLowerCase() === equipment.equipmentName.trim().toLocaleLowerCase())) throw new Error("Equipment Code already exists.");
  }
}
