import type { AssignmentRecord } from "../types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

export function displayAssignmentExpectedReturn(value: string | undefined): string {
  if (!value || value.startsWith("1970-01-01")) return "—";
  return value;
}

export function displayAssignmentDate(value: string | undefined): string {
  if (!value || value.startsWith("1970-01-01")) return "—";
  return value;
}

export function getAssignmentNumber(assignmentId: string, assignments: readonly AssignmentRecord[]): string {
  void assignments;
  if (!assignmentId) return "ASN-UNAVAILABLE";

  // Canonical legacy/UAT records may already use an authoritative ASN identity.
  if (/^ASN-/i.test(assignmentId)) return assignmentId;

  // UUID-backed canonical records have no persisted business number yet. Keep
  // their display identity stable without changing the routing identity.
  const stableIdentity = assignmentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return stableIdentity ? `ASN-${stableIdentity}` : "ASN-UNAVAILABLE";
}

export function getAssignmentDisplayName(input: { assignment: AssignmentRecord; equipment?: EquipmentRecord; operator?: Operator; project?: ProjectRecord; displayName?: string }): string {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;
  const project = input.project?.projectName?.trim();
  const equipment = input.equipment ? `${input.equipment.assetNo} - ${input.equipment.equipmentName}` : undefined;
  const operator = input.operator?.name?.trim();
  const parts = [project, equipment, operator].filter(Boolean);
  return parts.length >= 2 ? parts.join(" — ") : "Assignment details unavailable";
}
