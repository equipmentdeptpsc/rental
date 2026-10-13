import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deriveDeurEventState } from "@/features/rental/deur/services/deriveDeurEventState";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";
import { calculateDeurTotals } from "@/features/rental/deur/services/calculateDeurTotals";
import { resolveEffectiveDeurRevision } from "@/features/rental/deur/services/correction/resolveEffectiveDeurRevision";
import { describeCanonicalCurrentActivity } from "@/features/rental/deur/services/describeCanonicalCurrentActivity";

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

function operationalDate(deur: DeurRecord): string {
  return deur.reportDate ?? deur.workDate;
}

function newestFirst(left: DeurRecord, right: DeurRecord): number {
  return operationalDate(right).localeCompare(operationalDate(left))
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.id.localeCompare(left.id);
}

/**
 * Selects the current effective DEUR without allowing a late update to an older
 * work date (for example, a correction) to hide the return-day DEUR.
 */
export function selectDailyOperationsDeur(records: readonly DeurRecord[]): DeurRecord | undefined {
  const chains = new Map<string, DeurRecord[]>();
  records.forEach((record) => {
    const key = record.revision?.chainId ?? record.id;
    chains.set(key, [...(chains.get(key) ?? []), record]);
  });
  const effective = [...chains.values()].flatMap((chain) => {
    const resolution = resolveEffectiveDeurRevision(chain);
    const selected = resolution.valid
      ? resolution.pendingCorrection ?? resolution.currentEffective ?? resolution.original
      : chain.filter((record) => !record.revision?.supersededByRevisionId).sort(newestFirst)[0];
    return selected ? [selected] : [];
  });
  const active = effective.filter((record) => ["Draft", "In Progress"].includes(record.status)).sort(newestFirst);
  return active[0] ?? effective.sort(newestFirst)[0];
}

export function buildRentalLineOperations(input: {
  lines: readonly RentalEquipmentLine[];
  deurs: readonly DeurRecord[];
  evaluatedAt: string;
}): RentalLineOperationState[] {
  return input.lines.map((line) => {
    const related = input.deurs.filter((deur) => deur.rentalEquipmentLineId === line.id);
    const deur = selectDailyOperationsDeur(related);
    const state = deur ? deriveDeurEventState(deur) : undefined;
    const live = deur?.creationSource === "OPERATOR_DIGITAL" && ["Draft", "In Progress"].includes(deur.status);
    const projection = live
      ? projectDigitalDeurRunningState({ deur, evaluationTimestamp: input.evaluatedAt })
      : undefined;
    const canonical = deur ? calculateDeurTotals(deur.events ?? []).totals : undefined;
    const projected = projection?.valid ? projection.value : undefined;
    const currentActivity = deur ? describeCanonicalCurrentActivity(deur).label : "Not started";
    const issue = !deur ? "Operator has not started a DEUR for this equipment."
      : deur.status === "Rejected" ? "DEUR was rejected and requires attention."
      : state?.openPrimaryActivity === "breakdown" ? "Equipment breakdown is active."
      : !live && state?.hasOpenInterval ? "Canonical DEUR timeline is incomplete; canonical persisted totals are shown."
      : deur.status === "Submitted" ? "DEUR is pending acknowledgement."
      : "No current operational issues.";
    return {
      line: structuredClone(line),
      deur: deur ? structuredClone(deur) : undefined,
      currentActivity,
      projectedOperationMinutes: projected?.projectedOperationMinutes ?? deur?.totalOperatingMinutes ?? 0,
      idleMinutes: projected?.projectedIdleMinutes ?? deur?.totalIdleMinutes ?? 0,
      breakdownMinutes: projected?.projectedBreakdownMinutes ?? deur?.totalMaintenanceMinutes ?? 0,
      standbyMinutes: projected?.projectedStandbyMinutes ?? deur?.totalStandbyMinutes ?? 0,
      mealBreakMinutes: projected?.projectedMealBreakMinutes ?? deur?.totalMealBreakMinutes ?? 0,
      shiftMinutes: projected?.projectedShiftMinutes ?? canonical?.shiftMinutes ?? 0,
      lastUpdate: deur?.updatedAt ?? line.updatedAt,
      issue,
      priority: deur?.status === "Rejected" || state?.openPrimaryActivity === "breakdown" ? "critical" : !deur || deur.status === "Submitted" || (!live && state?.hasOpenInterval) ? "warning" : "normal",
      billingEligible: deur?.status === "Acknowledged" && !deur.billingLocked && !deur.billingStatementId && !deur.billId,
    };
  });
}
