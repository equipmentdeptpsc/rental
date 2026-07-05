import type {
    EquipmentHistoryRecord,
  } from "../types";
  
  export function createHistoryEvent(
    equipmentId: string,
  
    title: string,
  
    description: string,
  
    type: EquipmentHistoryRecord["type"]
  ) {
    return {
      equipmentId,
  
      title,
  
      description,
  
      type,
  
      performedBy: "System",
    };
  }