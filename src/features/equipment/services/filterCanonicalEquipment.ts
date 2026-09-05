import type { CanonicalEquipmentProjection } from "../hooks/useCanonicalEquipmentData";

export interface CanonicalEquipmentRemoteFilter {
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  statusId?: string;
  projectId?: string | typeof PROJECT_FILTER_UNASSIGNED;
  customerId?: string | typeof CUSTOMER_FILTER_NONE;
}

/** Typed UI selections translated to canonical NULL predicates by this adapter. */
export const PROJECT_FILTER_UNASSIGNED = "__UNASSIGNED_PROJECT__" as const;
export const CUSTOMER_FILTER_NONE = "__NO_CURRENT_CUSTOMER__" as const;

export function toCanonicalEquipmentQueryFilters(filter: CanonicalEquipmentRemoteFilter) {
  return {
    category_id: filter.categoryId || undefined,
    subcategory_id: filter.subcategoryId || undefined,
    status_id: filter.statusId || undefined,
    project_id: filter.projectId === PROJECT_FILTER_UNASSIGNED ? null : filter.projectId || undefined,
    customer_id: filter.customerId === CUSTOMER_FILTER_NONE ? null : filter.customerId || undefined,
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
