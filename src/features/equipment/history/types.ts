export type EquipmentHistoryType =
  | "CREATED"
  | "UPDATED"
  | "ASSIGNED"
  | "RETURNED"
  | "RENTED"
  | "RENTAL_RETURN"
  | "MAINTENANCE_START"
  | "MAINTENANCE_END"
  | "STATUS_CHANGE";

export interface EquipmentHistoryRecord {
  id: string;

  equipmentId: string;

  type: EquipmentHistoryType;

  title: string;

  description: string;

  performedBy: string;

  timestamp: string;
}