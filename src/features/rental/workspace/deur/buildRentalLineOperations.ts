import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deriveDeurEventState } from "@/features/rental/deur/services/deriveDeurEventState";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";

export interface RentalLineOperationState {
  line: RentalEquipmentLine;
  deur?: DeurRecord;
  currentActivity: string;
  projectedOperationMinutes: number;
  idleMinutes: number;
  breakdownMinutes: number;
  standbyMinutes: number;
  mealBreakMinutes: number;
  shiftMinutes: number;
  lastUpdate: string;
  issue: string;
  priority: "critical" | "warning" | "normal";
  billingEligible: boolean;
}

export function presentCurrentDeurActivity(activity?: string, shiftOpen = false): string {
  if (activity === "operation") return "Operating";
  if (activity === "idle") return "Idle / Waiting";
  if (activity === "standby") return "Standby";
  if (activity === "breakdown") return "Breakdown";
  if (activity === "mealBreak") return "Meal Break";
  if (activity) return activity.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
  return shiftOpen ? "Shift Active" : "No Active Activity";
}

export function buildRentalLineOperations(input: {
  lines: readonly RentalEquipmentLine[];
  deurs: readonly DeurRecord[];
  evaluatedAt: string;
}): RentalLineOperationState[] {
  return input.lines.map((line) => {
    const related = input.deurs
      .filter((deur) => deur.rentalEquipmentLineId === line.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const deur = related.find((item) => ["Draft", "In Progress"].includes(item.status)) ?? related[0];
    const state = deur ? deriveDeurEventState(deur) : undefined;
    const projection = deur?.creationSource === "OPERATOR_DIGITAL"
      ? projectDigitalDeurRunningState({ deur, evaluationTimestamp: input.evaluatedAt })
      : undefined;
    const currentActivity = presentCurrentDeurActivity(state?.openPrimaryActivity, state?.shiftOpen);
    const issue = !deur ? "Operator has not started a DEUR for this equipment."
      : deur.status === "Rejected" ? "DEUR was rejected and requires attention."
      : state?.openPrimaryActivity === "breakdown" ? "Equipment breakdown is active."
      : deur.status === "Submitted" ? "DEUR is pending acknowledgement."
      : "No current operational issues.";
    return {
      line: structuredClone(line),
      deur: deur ? structuredClone(deur) : undefined,
      currentActivity,
      projectedOperationMinutes: projection?.valid
        ? projection.value.projectedOperationMinutes
        : deur?.totals?.operationMinutes ?? deur?.totalOperatingMinutes ?? 0,
      idleMinutes: deur?.totals?.idleMinutes ?? deur?.totalIdleMinutes ?? 0,
      breakdownMinutes: deur?.totals?.breakdownMinutes ?? deur?.totalMaintenanceMinutes ?? 0,
      standbyMinutes: deur?.totals?.standbyMinutes ?? deur?.totalStandbyMinutes ?? 0,
      mealBreakMinutes: deur?.totals?.mealBreakMinutes ?? deur?.totalMealBreakMinutes ?? 0,
      shiftMinutes: deur?.totals?.shiftMinutes ?? 0,
      lastUpdate: deur?.updatedAt ?? line.updatedAt,
      issue,
      priority: deur?.status === "Rejected" || state?.openPrimaryActivity === "breakdown" ? "critical" : !deur || deur.status === "Submitted" ? "warning" : "normal",
      billingEligible: deur?.status === "Acknowledged" && !deur.billingLocked && !deur.billingStatementId && !deur.billId,
    };
  });
}
