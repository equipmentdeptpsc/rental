import type { RentalRecord } from "../types";
import type { IRentalRepository } from "./IRentalRepository";

import { storage } from "@/core/storage";
import { rentalData } from "../data/rental.mock";

const STORAGE_KEY = "equipment-rental-records";

export class LocalRentalRepository
  implements IRentalRepository
{
  private data: RentalRecord[];

  constructor() {
    this.data =
      storage.get<RentalRecord[]>(STORAGE_KEY) ??
      rentalData;
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
    this.save();
  }

  update(item: RentalRecord) {
    const index = this.data.findIndex(
      (x) => x.id === item.id
    );

    if (index >= 0) {
      this.data[index] = item;
      this.save();
    }
  }

  delete(id: string) {
    this.data = this.data.filter(
      (x) => x.id !== id
    );

    this.save();
  }

  private save() {
    storage.set(STORAGE_KEY, this.data);
  }
}