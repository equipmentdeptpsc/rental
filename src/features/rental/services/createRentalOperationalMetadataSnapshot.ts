import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { OperationalCodeSnapshot, RentalOperationalMetadataSnapshot } from "../types";
import type { ActivityCodeRecord } from "@/features/masters/activity-code";
import type { CostCodeRecord } from "@/features/masters/cost-code";

export type RentalOperationalMetadataIssueCode =
  | "COST_CODE_NOT_CONFIGURED"
  | "COST_CODE_NOT_FOUND"
  | "COST_CODE_INVALID"
  | "ACTIVITY_CODE_NOT_CONFIGURED"
  | "ACTIVITY_CODE_NOT_FOUND"
  | "ACTIVITY_CODE_INVALID"
  | "ASSIGNMENT_NOT_AVAILABLE";

export interface RentalOperationalMetadataIssue { code: RentalOperationalMetadataIssueCode }

interface Input {
  equipment: EquipmentRecord;
  assignment?: AssignmentRecord;
  costCodes: ({ id: string; code: string; name: string } | CostCodeRecord)[];
  activityCodes: ({ id: string; code: string; name: string } | ActivityCodeRecord)[];
}

export interface RentalOperationalMetadataSnapshotResult {
  snapshot: RentalOperationalMetadataSnapshot;
  issues: RentalOperationalMetadataIssue[];
  complete: boolean;
}

const snapshot = (id: string | undefined, code: string, name: string): OperationalCodeSnapshot | undefined => {
  const trimmedCode = code.trim();
  const trimmedName = name.trim();
  if (!trimmedCode || !trimmedName) return undefined;
  return { ...(id ? { id } : {}), code: trimmedCode, name: trimmedName };
};

export function createRentalOperationalMetadataSnapshot(input: Input): RentalOperationalMetadataSnapshotResult {
  const result: RentalOperationalMetadataSnapshot = {};
  const issues: RentalOperationalMetadataIssue[] = [];

  if (!input.equipment.costCodeId) {
    issues.push({ code: "COST_CODE_NOT_CONFIGURED" });
  } else {
    const record = input.costCodes.find((candidate) => candidate.id === input.equipment.costCodeId);
    if (!record) issues.push({ code: "COST_CODE_NOT_FOUND" });
    else {
      const captured = snapshot(record.id, record.code, "name" in record ? record.name : record.description);
      if (captured) result.costCode = captured;
      else issues.push({ code: "COST_CODE_INVALID" });
    }
  }

  if (!input.assignment) {
    issues.push({ code: "ASSIGNMENT_NOT_AVAILABLE" });
  } else if (!input.assignment.activityCodeId) {
    issues.push({ code: "ACTIVITY_CODE_NOT_CONFIGURED" });
  } else {
    const record = input.activityCodes.find((candidate) => candidate.id === input.assignment!.activityCodeId);
    if (!record) issues.push({ code: "ACTIVITY_CODE_NOT_FOUND" });
    else {
      const captured = snapshot(record.id, "code" in record ? record.code : record.activityCode, "name" in record ? record.name : record.description);
      if (captured) result.activityCode = captured;
      else issues.push({ code: "ACTIVITY_CODE_INVALID" });
    }
  }

  return structuredClone({ snapshot: result, issues, complete: issues.length === 0 });
}
