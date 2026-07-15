import type { RentalRecord } from "../types";
import type { IRentalRepository } from "./IRentalRepository";

const STORAGE_KEY = "rentals";

function load(): RentalRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) return [];

    const parsed = JSON.parse(data);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);

    return [];
  }
}

export class LocalRentalRepository
  implements IRentalRepository
{
  private data: RentalRecord[];

  constructor() {
    this.data = load();
  }

  private save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(this.data)
    );
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
}
