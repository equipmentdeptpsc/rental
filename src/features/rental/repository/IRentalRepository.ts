import type { RentalRecord } from "../types";
import type { CrudRepository } from "@/core/persistence";

export interface IRentalRepository extends CrudRepository<RentalRecord> {
  getAll(): RentalRecord[];

  getById(id: string): RentalRecord | undefined;

  create(item: RentalRecord): void;

  update(item: RentalRecord): void;

  delete(id: string): void;
}
