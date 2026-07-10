import type { EquipmentRecord } from "../types";

export type { EquipmentRecord };

export const equipmentData: EquipmentRecord[] = [
  {
    id: crypto.randomUUID(),

    prefixId: "seed-ex",

    assetNo: "EX-001",

    equipmentName: "Excavator ZX200",

    category: "Non-Moving Equipment",

    maintenanceType: "Engine Hours",

    currentReading: 3250,

    projectId: "",

    operatorId: "",

    status: "Assigned",

    deleted: false,
  },

  {
    id: crypto.randomUUID(),

    prefixId: "seed-ex",

    assetNo: "EX-002",

    equipmentName: "Bulldozer D85",

    category: "Non-Moving Equipment",

    maintenanceType: "Engine Hours",

    currentReading: 1845,

    projectId: "",

    operatorId: "",

    status: "Available",

    deleted: false,
  },

  {
    id: crypto.randomUUID(),

    prefixId: "seed-dt",

    assetNo: "DT-003",

    equipmentName: "Dump Truck FMX",

    category: "Moving Equipment",

    maintenanceType: "Kilometers",

    currentReading: 78420,

    projectId: "",

    operatorId: "",

    status: "Maintenance",

    deleted: false,
  },
];