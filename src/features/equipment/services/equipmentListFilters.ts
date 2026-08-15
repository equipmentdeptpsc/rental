import type { EquipmentRecord } from "../types";

export type EquipmentStatusFilter = "All" | "Available" | "Assigned" | "Deployed" | "Maintenance";

export interface EquipmentListFilter {
  status: EquipmentStatusFilter;
  query: string;
  category?: string;
  ownership?: string;
  location?: string;
}

export function equipmentMatchesStatus(item: EquipmentRecord, status: EquipmentStatusFilter): boolean {
  return status === "All" || item.status === (status === "Deployed" ? "Rented" : status);
}

export function filterEquipmentList(equipment: readonly EquipmentRecord[], filter: EquipmentListFilter): EquipmentRecord[] {
  const query = filter.query.trim().toLowerCase();
  return equipment.filter((item) => item.active !== false && !item.deleted)
    .filter((item) => equipmentMatchesStatus(item, filter.status))
    .filter((item) => !filter.category || item.category === filter.category)
    .filter((item) => !filter.ownership || item.ownership === filter.ownership)
    .filter((item) => !filter.location || item.location === filter.location)
    .filter((item) => !query || `${item.assetNo} ${item.equipmentName} ${item.category} ${item.subcategoryName ?? ""} ${item.ownership ?? ""} ${item.location ?? ""}`.toLowerCase().includes(query));
}
