import type { EquipmentRecord } from "../data/equipment.mock";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface EquipmentAuditLog {
  id: string;
  action: AuditAction;
  timestamp: number;
  equipmentId: string;

  before?: EquipmentRecord;
  after?: EquipmentRecord;
}