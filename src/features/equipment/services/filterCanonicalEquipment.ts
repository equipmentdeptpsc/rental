import type { CanonicalEquipmentProjection } from "../hooks/useCanonicalEquipmentData";

export interface CanonicalEquipmentFilter { query: string; category: string; status: string }

export function filterCanonicalEquipment(items: readonly CanonicalEquipmentProjection[], filter: CanonicalEquipmentFilter) {
  const query = filter.query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery = !query || `${item.assetNo} ${item.equipmentName} ${item.category ?? ""} ${item.statusLabel ?? ""}`.toLowerCase().includes(query);
    return matchesQuery && (!filter.category || item.category === filter.category) && (!filter.status || item.statusLabel === filter.status);
  });
}
