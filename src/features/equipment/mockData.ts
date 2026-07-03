import type { EquipmentRecord } from "./types";

export const mockEquipment: EquipmentRecord[] = [
  {
    id: crypto.randomUUID(),
    assetNo: "EX-001",
    equipmentName: "Excavator ZX200",
    category: "Excavator",
    maintenanceType: "Engine Hours",
    currentReading: 3250,
    project: "Metro Line Extension",
    operator: "Juan Dela Cruz",
    status: "Assigned",
  },
  {
    id: crypto.randomUUID(),
    assetNo: "BD-002",
    equipmentName: "Bulldozer D85",
    category: "Bulldozer",
    maintenanceType: "Engine Hours",
    currentReading: 1845,
    project: "North Highway",
    operator: "Pedro Santos",
    status: "Available",
  },
];