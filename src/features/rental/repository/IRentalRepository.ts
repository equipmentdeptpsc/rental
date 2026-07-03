import type { RentalRecord } from "../types";

export interface IRentalRepository {
  getAll(): RentalRecord[];

  getById(id: string): RentalRecord | undefined;

  create(item: RentalRecord): void;

  update(item: RentalRecord): void;

  delete(id: string): void;
}