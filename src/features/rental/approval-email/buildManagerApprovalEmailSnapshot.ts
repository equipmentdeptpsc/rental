import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalRecord } from "../types";
import type { RentalContractRecord } from "../types/RentalContract";
import type { ManagerApprovalCommercialSnapshot, ManagerApprovalEmailSnapshot } from "./types";
import { createRentalCommercialSnapshot } from "../services/createRentalCommercialSnapshot";
import { resolveCommercialSummary } from "../commercial/resolveCommercialSummary";

export function buildManagerApprovalEmailSnapshot(input: {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  contracts: RentalContractRecord[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  project?: ProjectRecord;
  customer?: CustomerRecord;
  requestedBy: string;
  requestedAt: string;
  commercialTermsComplete: boolean;
  conflictsDetected: boolean;
}): ManagerApprovalEmailSnapshot {
  const warnings: string[] = [];
  if (!input.customer && !input.rental.customer.trim()) warnings.push("Customer is missing.");
  if (!input.project && !input.rental.project.trim()) warnings.push("Project is missing.");
  if (!input.commercialTermsComplete) warnings.push("Commercial Terms are incomplete.");

  const equipment = input.lines.map((line) => {
    const item = input.equipment.find((candidate) => candidate.id === line.equipmentId);
    const operator = input.operators.find((candidate) => candidate.id === line.operatorId);
    if (!operator) warnings.push(`Operator is missing for ${item?.assetNo ?? "an equipment line"}.`);
    if (!item || item.deleted || item.active === false || item.status === "Maintenance" || item.status === "Rented") {
      warnings.push(`Equipment ${item?.assetNo ?? "record"} is unavailable.`);
    }
    return {
      equipmentCode: item?.assetNo ?? "Unavailable",
      equipmentName: item?.equipmentName ?? "Unavailable",
      assetNumber: item?.assetNo ?? "Unavailable",
      assignedOperator: operator?.name ?? "Not assigned",
      quantity: 1,
    };
  });

  const commercial: ManagerApprovalCommercialSnapshot[] = input.lines.map((line, index) => {
    const item = input.equipment.find((candidate) => candidate.id === line.equipmentId);
    const contract = input.contracts.find((candidate) => candidate.rentalEquipmentLineId === line.id)
      ?? (input.lines.length === 1 ? input.contracts.find((candidate) => candidate.rentalId === input.rental.id || candidate.id === input.rental.id) : undefined);
    const snapshot = line.commercialSnapshot;
    const captured = !snapshot && contract ? createRentalCommercialSnapshot(contract, input.requestedAt) : undefined;
    const effectiveSnapshot = snapshot ?? (captured?.success ? captured.snapshot : undefined);
    return {
      equipmentCode: equipment[index]?.equipmentCode ?? item?.assetNo ?? "Unavailable",
      billingMethod: snapshot?.billingMethod ?? contract?.billingMethod ?? "Not configured",
      unitRate: snapshot?.unitRate ?? contract?.unitRate,
      contractAmount: snapshot?.contractAmount ?? contract?.contractAmount,
      vatIncluded: snapshot ? Boolean(snapshot.taxRate) : contract?.vatApplicability === "Applicable",
      fuelIncluded: (snapshot?.fuelCharge ?? contract?.fuelCharge ?? 0) > 0,
      operatorIncluded: snapshot?.operatorIncluded ?? contract?.operatorIncluded ?? false,
      commercialTermsConfigured: Boolean(snapshot || contract),
      commercialSnapshotLocked: Boolean(snapshot),
      currency: snapshot?.currency ?? contract?.currency ?? "PHP",
      summary: resolveCommercialSummary(effectiveSnapshot),
    };
  });

  const assignmentComplete = input.lines.every((line) => Boolean(line.assignmentId && input.assignments.some((assignment) => assignment.id === line.assignmentId && assignment.status === "Active")));
  const operatorAssigned = input.lines.every((line) => input.operators.some((operator) => operator.id === line.operatorId));
  const equipmentAvailable = input.lines.every((line) => {
    const item = input.equipment.find((candidate) => candidate.id === line.equipmentId);
    return Boolean(item && !item.deleted && item.active !== false && (item.status === "Available" || item.status === "Assigned"));
  });
  if (!assignmentComplete) warnings.push("Assignment is incomplete.");
  if (input.conflictsDetected) warnings.push("Equipment conflicts were detected.");

  return {
    rentalNumber: input.rental.rentalNumber ?? "Unnumbered Rental",
    customer: input.customer?.companyName ?? (input.rental.customer || "Missing Customer"),
    project: input.project?.projectName ?? (input.rental.project || "Missing Project"),
    rentalType: input.rental.rentalType ?? "Not specified",
    rentalPeriod: `${input.rental.dateOut} to ${input.rental.expectedReturn ?? "Open-ended"}`,
    requestedBy: input.requestedBy,
    requestedDate: input.requestedAt,
    currentStatus: input.rental.status,
    approvalStatus: "Pending",
    equipment,
    commercial,
    readiness: {
      assignmentComplete,
      commercialTermsComplete: input.commercialTermsComplete,
      equipmentAvailable,
      operatorAssigned,
      conflictsDetected: input.conflictsDetected,
      expectedReleaseDate: input.rental.dateOut,
    },
    warnings: [...new Set(warnings)],
  };
}
