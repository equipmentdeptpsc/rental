export interface EquipmentRecord {
    id: string;
    assetNo: string;
    equipmentName: string;
    category: string;
    status: "Available" | "Assigned" | "Maintenance";
    maintenanceType: "Odometer" | "Engine Hours";
    currentReading: number;
    project: string;
    operator: string;
  }
  
  export const equipmentData: EquipmentRecord[] = [
    {
      id: "1",
      assetNo: "EX-001",
      equipmentName: "Komatsu PC200",
      category: "Excavator",
      status: "Assigned",
      maintenanceType: "Engine Hours",
      currentReading: 4235,
      project: "North Bridge",
      operator: "Juan Dela Cruz",
    },
    {
      id: "2",
      assetNo: "WL-002",
      equipmentName: "CAT 950GC",
      category: "Wheel Loader",
      status: "Available",
      maintenanceType: "Engine Hours",
      currentReading: 2180,
      project: "-",
      operator: "-",
    },
    {
      id: "3",
      assetNo: "DT-003",
      equipmentName: "Hino 700",
      category: "Dump Truck",
      status: "Maintenance",
      maintenanceType: "Odometer",
      currentReading: 81234,
      project: "-",
      operator: "-",
    },
  ];