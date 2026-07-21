import type { DeurRecord } from "../types";
import type { ActiveOperatorDeurResult } from "./types";

export function resolveActiveOperatorDeur({ rentalId, rentalEquipmentLineId, equipmentId, operatorId, deurs }: { rentalId: string; rentalEquipmentLineId?: string; equipmentId?: string; operatorId: string; deurs: DeurRecord[] }): ActiveOperatorDeurResult {
  const matches = structuredClone(deurs).filter((record) => record.rentalId === rentalId && (!rentalEquipmentLineId || (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === rentalEquipmentLineId : record.equipmentId === equipmentId)) && record.operatorId === operatorId && record.creationSource === "OPERATOR_DIGITAL" && ["Draft", "In Progress"].includes(record.status) && !record.billingLocked && !record.billId && !record.billingStatementId && !record.revision?.supersededByRevisionId && !record.revision?.previousRevisionId);
  if (matches.length === 0) return { status: "NONE" };
  if (matches.length > 1) return { status: "AMBIGUOUS", issue: { code: "DEUR_ACTIVE_RECORD_AMBIGUOUS", message: "Multiple editable Digital DEUR records match this Rental and Operator." } };
  return { status: "RESOLVED", record: structuredClone(matches[0]) };
}
