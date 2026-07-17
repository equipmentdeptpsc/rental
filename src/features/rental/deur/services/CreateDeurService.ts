import type { RentalLifecycleStatus } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { deurRepository } from "../repository/deurRepository";

export interface CreateDeurRequest {
  rentalId: string;
  rentalStatus: RentalLifecycleStatus;
  equipmentId: string;
  operatorId: string;
  assignmentId?: string;
  projectId?: string;
  customerId?: string;
}

export type CreateDeurResult =
  | { success: true; record: DeurRecord }
  | { success: false; message: string };

export function getDeurCreationError(request: CreateDeurRequest): string | undefined {
  if (!['Released', 'Active'].includes(request.rentalStatus)) {
    if (request.rentalStatus === "Returned") {
      return "Returned rentals cannot create new DEUR records.";
    }

    if (request.rentalStatus === "Closed") {
      return "Closed rentals cannot create new DEUR records.";
    }

    if (request.rentalStatus === "Cancelled") {
      return "Cancelled rentals cannot create new DEUR records.";
    }

    return "Release the rental before creating a DEUR.";
  }

  const required: Array<[string, string | undefined]> = [
    ["rental", request.rentalId],
    ["equipment", request.equipmentId],
    ["operator", request.operatorId],
  ];
  const missing = required.find(([, value]) => !value?.trim());

  if (missing) {
    return `Missing required ${missing[0]} relationship.`;
  }

  const hasActiveDeur = deurRepository.getByRentalId(request.rentalId).some(
    (record) => !record.endOfDay && record.status !== "Billed"
  );

  if (hasActiveDeur) {
    return "A DEUR already exists for this rental.";
  }

  return undefined;
}

export function createDeur(request: CreateDeurRequest): CreateDeurResult {
  const error = getDeurCreationError(request);
  if (error) return { success: false, message: error };

  const timestamp = new Date().toISOString();
  const record: DeurRecord = {
    id: crypto.randomUUID(),
    rentalId: request.rentalId,
    assignmentId: request.assignmentId,
    equipmentId: request.equipmentId,
    operatorId: request.operatorId,
    projectId: request.projectId,
    customerId: request.customerId,
    workDate: timestamp.split("T")[0],
    logs: [],
    totalOperatingMinutes: 0,
    totalIdleMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    status: "Draft",
    billingLocked: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const persisted = deurRepository.create(record);
  return { success: true, record: persisted };
}
