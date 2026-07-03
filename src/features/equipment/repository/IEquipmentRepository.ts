import type { EquipmentRecord } from "../types";

export interface IEquipmentRepository {
  getAll(): EquipmentRecord[];

  getById(id: string): EquipmentRecord | undefined;

  create(item: EquipmentRecord): void;

  update(item: EquipmentRecord): void;

  delete(id: string): void;
}