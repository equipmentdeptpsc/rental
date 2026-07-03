import type { MaintenanceRecord } from "./types";

const STORAGE_KEY = "maintenance_records";

class MaintenanceRepository {
  getAll(): MaintenanceRecord[] {
    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) return [];

    return JSON.parse(data);
  }

  getById(id: string) {
    return this.getAll().find(
      (item) => item.id === id
    );
  }

  create(item: MaintenanceRecord) {
    const items = this.getAll();

    items.push(item);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }

  update(item: MaintenanceRecord) {
    const items = this.getAll().map((i) =>
      i.id === item.id ? item : i
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }

  delete(id: string) {
    const items = this.getAll().filter(
      (i) => i.id !== id
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }
}

export const maintenanceRepository =
  new MaintenanceRepository();