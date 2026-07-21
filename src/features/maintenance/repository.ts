import type { MaintenanceRecord } from "./types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("Maintenance");

class MaintenanceRepository {
  getAll(): MaintenanceRecord[] {
    return persistence.load<MaintenanceRecord[]>() ?? [];
  }

  getById(id: string) {
    return this.getAll().find(
      (item) => item.id === id
    );
  }

  create(item: MaintenanceRecord) {
    const items = this.getAll();

    items.push(item);

    persistence.save(items);
  }

  update(item: MaintenanceRecord) {
    const items = this.getAll().map((i) =>
      i.id === item.id ? item : i
    );

    persistence.save(items);
  }

  delete(id: string) {
    const items = this.getAll().filter(
      (i) => i.id !== id
    );

    persistence.save(items);
  }
}

export const maintenanceRepository =
  new MaintenanceRepository();
