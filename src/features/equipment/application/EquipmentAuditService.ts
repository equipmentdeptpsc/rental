import type { EquipmentRecord } from "../types";

export interface EquipmentAuditPayload {
  action: "CREATE" | "UPDATE" | "DELETE";

  equipmentId: string;

  before?: EquipmentRecord;

  after?: EquipmentRecord;
}

export function auditAssignment(
  before: EquipmentRecord,
  after: EquipmentRecord
): EquipmentAuditPayload {
  return {
    action: "UPDATE",
    equipmentId: before.id,
    before,
    after,
  };
}

export function auditRental(
  before: EquipmentRecord,
  after: EquipmentRecord
): EquipmentAuditPayload {
  return {
    action: "UPDATE",
    equipmentId: before.id,
    before,
    after,
  };
}

export function auditRentalClose(
  before: EquipmentRecord,
  after: EquipmentRecord
): EquipmentAuditPayload {
  return {
    action: "UPDATE",
    equipmentId: before.id,
    before,
    after,
  };
}

export function auditRestore(
  equipment: EquipmentRecord
): EquipmentAuditPayload {
  return {
    action: "UPDATE",
    equipmentId: equipment.id,
    after: equipment,
  };
}

export function auditDelete(
  equipment: EquipmentRecord
): EquipmentAuditPayload {
  return {
    action: "DELETE",
    equipmentId: equipment.id,
    before: equipment,
  };
}