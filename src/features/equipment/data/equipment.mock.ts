import type { EquipmentRecord } from "../types";

/**
 * Re-export EquipmentRecord so existing imports continue to work.
 */
export type { EquipmentRecord };

export const equipmentData: EquipmentRecord[] = [
  {
    id: crypto.randomUUID(),
    assetNo: "EX-001",
    equipmentName: "Excavator ZX200",
    category: "Excavator",
    maintenanceType: "Engine Hours",
    currentReading: 3250,
    projectId: "",
    operatorId: "",
    status: "Assigned",
  },
  {
    id: crypto.randomUUID(),
    assetNo: "BD-002",
    equipmentName: "Bulldozer D85",
    category: "Bulldozer",
    maintenanceType: "Engine Hours",
    currentReading: 1845,
    projectId: "",
    operatorId: "",
    status: "Available",
  },
  {
    id: crypto.randomUUID(),
    assetNo: "DT-003",
    equipmentName: "Dump Truck FMX",
    category: "Dump Truck",
    maintenanceType: "Odometer",
    currentReading: 78420,
    projectId: "",
    operatorId: "",
    status: "Maintenance",
  },
];