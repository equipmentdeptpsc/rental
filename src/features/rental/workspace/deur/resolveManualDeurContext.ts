import type { AssignmentRecord } from "@/features/assignment/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";

export interface ManualDeurContext {
  project?: ProjectRecord;
  customer?: CustomerRecord;
  activityCode?: { code: string; name: string };
  workDescription?: { code?: string; name: string };
  meterRequirement?: "none" | "odometer" | "hourMeter" | "both";
  missing: string[];
}

export function resolveManualDeurContext(input: {
  rental: RentalRecord;
  line: RentalEquipmentLine;
  project?: ProjectRecord;
  customer?: CustomerRecord;
  assignment?: AssignmentRecord;
  activityCodes: readonly CanonicalReferenceCode[];
}): ManualDeurContext {
  const snapshot = input.line.deurExpectationSnapshot;
  const project = snapshot?.projectId === input.project?.id ? input.project : undefined;
  const customer = snapshot?.customerId === input.customer?.id ? input.customer : undefined;
  const snapshotActivity = snapshot?.operationalMetadata?.activityCode;
  const referenceActivity = input.activityCodes.find((item) => item.id === input.assignment?.activityCodeId);
  const activityCode = snapshotActivity?.code
    ? { code: snapshotActivity.code, name: snapshotActivity.name }
    : referenceActivity?.code
      ? { code: referenceActivity.code, name: referenceActivity.name }
      : undefined;
  const workDescription = snapshot?.workDescription?.name
    ? { ...(snapshot.workDescription.code ? { code: snapshot.workDescription.code } : {}), name: snapshot.workDescription.name }
    : undefined;
  const meterRequirement = snapshot?.meterRequirement;
  const missing: string[] = [];
  if (!project) missing.push("Project");
  if (!customer) missing.push("Customer");
  if (!activityCode) missing.push("Activity Code");
  if (!meterRequirement) missing.push("Meter Requirement");
  return { project, customer, activityCode, workDescription, meterRequirement, missing };
}
