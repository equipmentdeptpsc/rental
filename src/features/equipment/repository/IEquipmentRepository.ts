import type { EquipmentRecord } from "../types";
import type { CrudRepository, SoftDeleteRepository } from "@/core/persistence";

export interface IEquipmentRepository extends CrudRepository<EquipmentRecord>, SoftDeleteRepository<EquipmentRecord> {
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
