import type { RentalRecord } from "../types";
import type { IRentalRepository } from "./IRentalRepository";

import { rentalData } from "../data/rental.mock";

export class LocalRentalRepository
  implements IRentalRepository
{
  private data: RentalRecord[];

  constructor() {
    this.data = rentalData;
  }

  getAll(): RentalRecord[] {
    return this.data;
  }

  getById(id: string) {
    return this.data.find(
      (x) => x.id === id
    );
  }

  create(item: RentalRecord) {
    this.data.push(item);
  }

  update(item: RentalRecord) {
    const index = this.data.findIndex(
      (x) => x.id === item.id
    );

    if (index >= 0) {
      this.data[index] = item;
    }
  }

  delete(id: string) {
    this.data = this.data.filter(
      (x) => x.id !== id
    );
  }
}