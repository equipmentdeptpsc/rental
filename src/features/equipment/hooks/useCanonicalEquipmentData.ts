import { useCallback, useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { subscribeCanonicalEquipmentRefresh } from "@/features/equipment/remote/canonicalEquipmentRefresh";

export interface CanonicalEquipmentProjection {
  id: string;
  assetNo: string;
  equipmentName: string;
  statusId?: string;
  statusLabel?: string;
  active: boolean;
  deleted: boolean;
  category?: string;
  subcategoryId?: string;
  subcategoryName?: string;
  subcategoryActive?: boolean;
  type?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  maintenanceType?: string;
  currentReading?: number;
}

type State =
  | { status: "loading"; items: CanonicalEquipmentProjection[] }
  | { status: "loaded"; items: CanonicalEquipmentProjection[] }
  | { status: "error"; items: CanonicalEquipmentProjection[]; message: string };

const text = (value: unknown) => typeof value === "string" ? value : undefined;

export function useCanonicalEquipmentData() {
  const { readRepositories, repositories } = useApplicationDependenciesCompatibility();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => subscribeCanonicalEquipmentRefresh(retry), [retry]);

  useEffect(() => {
    let active = true;
    setState({ status: "loading", items: [] });
    void Promise.all([readRepositories.equipment.list(), repositories.equipmentStatusRead.list()]).then(([equipment, statuses]) => {
      if (!active) return;
      if (!equipment.success || !statuses.success) {
        setState({ status: "error", items: [], message: "Canonical Equipment data could not be loaded." });
        return;
      }
      const statusLabels = new Map(statuses.value.filter((item) => item.active && !item.deleted).map((item) => [item.id, item.status]));
      const items = equipment.value.items.map((record) => {
        const row = record as unknown as Record<string, unknown>;
        const statusId = text(row.statusId);
        return {
          id: record.id,
          assetNo: record.assetNo,
          equipmentName: record.equipmentName,
          statusId,
          statusLabel: statusId ? statusLabels.get(statusId) : undefined,
          active: row.active === true,
          deleted: row.deletedAt !== null && row.deletedAt !== undefined,
          category: text(row.category),
          subcategoryId: text(row.subcategoryId),
          subcategoryName: text(row.subcategoryName),
          subcategoryActive: typeof row.subcategoryActive === "boolean" ? row.subcategoryActive : undefined,
          type: text(row.type),
          manufacturer: text(row.manufacturer),
          model: text(row.modelText) ?? text(row.model),
          serialNumber: text(row.serialNumber),
          maintenanceType: text(row.maintenanceType),
          currentReading: typeof row.currentReading === "number" ? row.currentReading : undefined,
        };
      });
      setState({ status: "loaded", items });
    }).catch(() => { if (active) setState({ status: "error", items: [], message: "Canonical Equipment data could not be loaded." }); });
    return () => { active = false; };
  }, [attempt, readRepositories.equipment, repositories.equipmentStatusRead]);

  return { ...state, retry };
}
