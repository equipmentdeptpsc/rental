import { assignmentRepository } from "@/features/assignment/repository";
import { customerRepository } from "@/features/customer/repository";
import { equipmentHistoryRepository } from "@/features/equipment/history/repository";
import { maintenanceRepository } from "@/features/maintenance/repository";
import { operatorRepository } from "@/features/operators/repository";
import { projectRepository } from "@/features/project/repository";
import { rentalRepository } from "@/features/rental/repository";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { storage } from "@/core/storage";
import { dailyLogRepository } from "@/features/daily-log/repository";

export interface DeletionGuardResult { success: boolean; message?: string; }

function blocked(entity: string, relationship: string): DeletionGuardResult {
  return { success: false, message: `${entity} cannot be deleted because it is referenced by ${relationship} records.` };
}

export function guardEquipmentDeletion(id: string): DeletionGuardResult {
  if (assignmentRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "assignment");
  if (rentalRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "rental");
  if (maintenanceRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "maintenance");
  if (deurRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "DEUR");
  if (billingStatementRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "billing statement");
  if (rentalContractRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "rental contract");
  if (equipmentHistoryRepository.getAll().some(x => x.equipmentId === id)) return blocked("Equipment", "equipment history");
  const audits = storage.get<Array<{ equipmentId: string }>>("equipment-audit-logs") ?? [];
  if (audits.some(x => x.equipmentId === id)) return blocked("Equipment", "audit");
  return { success: true };
}

export function guardProjectDeletion(id: string): DeletionGuardResult {
  if (assignmentRepository.getAll().some(x => x.projectId === id)) return blocked("Project", "assignment");
  if (rentalRepository.getAll().some(x => x.projectId === id)) return blocked("Project", "rental");
  if (deurRepository.getAll().some(x => x.projectId === id)) return blocked("Project", "DEUR");
  if (rentalContractRepository.getAll().some(x => x.projectId === id)) return blocked("Project", "rental contract");
  if (dailyLogRepository.getAll().some(x => x.projectId === id)) return blocked("Project", "daily log");
  return { success: true };
}

export function guardOperatorDeletion(id: string): DeletionGuardResult {
  if (assignmentRepository.getAll().some(x => x.operatorId === id)) return blocked("Operator", "assignment");
  if (rentalRepository.getAll().some(x => x.operatorId === id)) return blocked("Operator", "rental");
  if (deurRepository.getAll().some(x => x.operatorId === id)) return blocked("Operator", "DEUR");
  return { success: true };
}

export function guardCustomerDeletion(id: string): DeletionGuardResult {
  if (rentalRepository.getAll().some(x => x.customerId === id)) return blocked("Customer", "rental");
  if (rentalContractRepository.getAll().some(x => x.customerId === id)) return blocked("Customer", "rental contract");
  return { success: true };
}

export const deletionGuardRepositories = { customerRepository, operatorRepository, projectRepository };
