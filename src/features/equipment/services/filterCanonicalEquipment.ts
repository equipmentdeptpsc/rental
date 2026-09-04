import type { CanonicalEquipmentProjection } from "../hooks/useCanonicalEquipmentData";

export interface CanonicalEquipmentRemoteFilter {
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  statusId?: string;
  projectId?: string;
}

export function toCanonicalEquipmentQueryFilters(filter: CanonicalEquipmentRemoteFilter) {
  return {
    category_id: filter.categoryId || undefined,
    subcategory_id: filter.subcategoryId || undefined,
    status_id: filter.statusId || undefined,
    project_id: filter.projectId || undefined,
  };
}

/** Local-only projection filtering retained for compatibility and search presentation. */
export interface CanonicalEquipmentFilter { query: string; category: string; status: string }

export function filterCanonicalEquipment(items: readonly CanonicalEquipmentProjection[], filter: CanonicalEquipmentFilter) {
  const query = filter.query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery = !query || `${item.assetNo} ${item.equipmentName} ${item.category ?? ""} ${item.statusLabel ?? ""}`.toLowerCase().includes(query);
    return matchesQuery && (!filter.category || item.category === filter.category) && (!filter.status || item.statusLabel === filter.status);
  });
}
