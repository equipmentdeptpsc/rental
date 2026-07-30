import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deriveDeurEventState } from "@/features/rental/deur/services/deriveDeurEventState";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";

export interface RentalLineOperationState {
  line: RentalEquipmentLine;
  deur?: DeurRecord;
  currentActivity?: string;
  projectedOperationMinutes: number;
  idleMinutes: number;
  breakdownMinutes: number;
  billingEligible: boolean;
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
    return {
      line: structuredClone(line),
      deur: deur ? structuredClone(deur) : undefined,
      currentActivity: state?.openPrimaryActivity ?? (state?.shiftOpen ? "shift" : undefined),
      projectedOperationMinutes: projection?.valid
        ? projection.value.projectedOperationMinutes
        : deur?.totals?.operationMinutes ?? deur?.totalOperatingMinutes ?? 0,
      idleMinutes: deur?.totals?.idleMinutes ?? deur?.totalIdleMinutes ?? 0,
      breakdownMinutes: deur?.totals?.breakdownMinutes ?? deur?.totalMaintenanceMinutes ?? 0,
      billingEligible: deur?.status === "Acknowledged" && !deur.billingLocked && !deur.billingStatementId && !deur.billId,
    };
  });
}
