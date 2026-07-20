import type { ActivityCodeRecord } from "@/features/masters/activity-code";

export interface AssignmentActivityCodeOption {
  value: string;
  label: string;
}

export type AssignmentActivityCodeConfiguration =
  | { status: "configured" | "inactive" | "deleted"; record: ActivityCodeRecord }
  | { status: "missing"; message: "Activity Code not configured" }
  | { status: "not-found"; message: "Activity Code not found" };

export function getActiveAssignmentActivityCodeOptions(
  records: ActivityCodeRecord[],
): AssignmentActivityCodeOption[] {
  return records
    .filter((record) => record.active && !record.deleted)
    .map((record) => ({
      value: record.id,
      label: `${record.activityCode} — ${record.description}`,
    }));
}

export function evaluateAssignmentActivityCodeConfiguration(
  activityCodeId: string | undefined,
  records: ActivityCodeRecord[],
): AssignmentActivityCodeConfiguration {
  if (!activityCodeId) {
    return { status: "missing", message: "Activity Code not configured" };
  }

  const record = records.find((candidate) => candidate.id === activityCodeId);
  if (!record) return { status: "not-found", message: "Activity Code not found" };
  if (record.deleted) return { status: "deleted", record };
  if (!record.active) return { status: "inactive", record };
  return { status: "configured", record };
}
