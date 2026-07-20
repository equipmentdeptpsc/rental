import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurOperationalCodeSnapshot, DeurOperationalMetadataSnapshot, DeurWorkDescriptionSnapshot } from "../types";

export type DeurOperationalMetadataIssueCode =
  | "RENTAL_COST_CODE_NOT_CAPTURED" | "RENTAL_ACTIVITY_CODE_NOT_CAPTURED"
  | "WORK_DESCRIPTION_REQUIRED" | "WORK_DESCRIPTION_INVALID" | "WORK_DESCRIPTION_INACTIVE"
  | "WORK_DESCRIPTION_DELETED" | "WORK_DESCRIPTION_NOT_OPERATOR_SELECTABLE"
  | "WORK_DESCRIPTION_REMARKS_REQUIRED";
export interface DeurOperationalMetadataIssue { code: DeurOperationalMetadataIssueCode; message: string }
interface Input { rental: RentalRecord; selectedWorkDescription?: WorkDescriptionRecord; remarks?: string }
export interface CreateDeurOperationalMetadataSnapshotResult {
  snapshot: DeurOperationalMetadataSnapshot; remarks?: string;
  issues: DeurOperationalMetadataIssue[]; complete: boolean;
}

function codeSnapshot(value: unknown): DeurOperationalCodeSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!code || !name) return undefined;
  return { ...(typeof candidate.id === "string" && candidate.id.trim() ? { id: candidate.id.trim() } : {}), code, name };
}

function workDescriptionSnapshot(value: WorkDescriptionRecord): DeurWorkDescriptionSnapshot | undefined {
  const name = value.name.trim();
  if (!name) return undefined;
  const code = value.code.trim();
  return { ...(value.id.trim() ? { id: value.id.trim() } : {}), ...(code ? { code } : {}), name, requiresRemarks: value.requiresRemarks === true };
}

export function createDeurOperationalMetadataSnapshot({ rental, selectedWorkDescription, remarks }: Input): CreateDeurOperationalMetadataSnapshotResult {
  const snapshot: DeurOperationalMetadataSnapshot = {};
  const issues: DeurOperationalMetadataIssue[] = [];
  const costCode = codeSnapshot(rental.operationalMetadata?.costCode);
  const activityCode = codeSnapshot(rental.operationalMetadata?.activityCode);
  if (costCode) snapshot.costCode = costCode;
  else issues.push({ code: "RENTAL_COST_CODE_NOT_CAPTURED", message: "Cost Code was not captured on the Rental." });
  if (activityCode) snapshot.activityCode = activityCode;
  else issues.push({ code: "RENTAL_ACTIVITY_CODE_NOT_CAPTURED", message: "Activity Code was not captured on the Rental." });

  const normalizedRemarks = typeof remarks === "string" ? remarks.trim() : "";
  if (!selectedWorkDescription) issues.push({ code: "WORK_DESCRIPTION_REQUIRED", message: "Work Description is required." });
  else if (!selectedWorkDescription.active) issues.push({ code: "WORK_DESCRIPTION_INACTIVE", message: "The selected Work Description is inactive." });
  else if (selectedWorkDescription.deleted) issues.push({ code: "WORK_DESCRIPTION_DELETED", message: "The selected Work Description was deleted." });
  else if (selectedWorkDescription.operatorSelectable === false) issues.push({ code: "WORK_DESCRIPTION_NOT_OPERATOR_SELECTABLE", message: "The selected Work Description is not operator-selectable." });
  else {
    const selectedSnapshot = workDescriptionSnapshot(selectedWorkDescription);
    if (!selectedSnapshot) issues.push({ code: "WORK_DESCRIPTION_INVALID", message: "The selected Work Description is invalid." });
    else {
      snapshot.workDescription = selectedSnapshot;
      if (selectedSnapshot.requiresRemarks && !normalizedRemarks) issues.push({ code: "WORK_DESCRIPTION_REMARKS_REQUIRED", message: "Remarks are required for this Work Description." });
    }
  }
  return { snapshot: structuredClone(snapshot), ...(normalizedRemarks ? { remarks: normalizedRemarks } : {}), issues: structuredClone(issues), complete: issues.length === 0 };
}
