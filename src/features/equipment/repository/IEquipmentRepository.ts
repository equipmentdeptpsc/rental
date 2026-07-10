import type { EquipmentRecord } from "../types";

export interface IEquipmentRepository {
  getAll(): EquipmentRecord[];

  getDeleted(): EquipmentRecord[];

  getById(
    id: string
  ): EquipmentRecord | undefined;

  create(
    equipment: EquipmentRecord
  ): void;

  update(
    equipment: EquipmentRecord
  ): void;

  delete(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  permanentlyDelete(
    id: string
  ): void;
}