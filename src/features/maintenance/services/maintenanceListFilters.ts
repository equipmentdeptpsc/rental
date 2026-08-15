export type MaintenanceHealthFilter = "All" | "Overdue" | "Due Soon" | "Healthy";
export type MaintenanceDueItem = { due: boolean; remaining: number; equipment: { status: string } };

export function maintenanceHealth(item: MaintenanceDueItem): Exclude<MaintenanceHealthFilter, "All"> {
  if (item.due) return "Overdue";
  if (item.remaining <= 50) return "Due Soon";
  return "Healthy";
}

export function filterMaintenanceDue<T extends MaintenanceDueItem>(items: readonly T[], filter: MaintenanceHealthFilter): T[] {
  return filter === "All" ? [...items] : items.filter((item) => maintenanceHealth(item) === filter);
}
