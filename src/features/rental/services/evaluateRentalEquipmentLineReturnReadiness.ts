import type { DeurShiftWindowDefinition, RentalRecord } from "../types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { DeurRecord } from "../deur/types";
import { generateRentalDeurExpectations } from "../deur/expectation/generateRentalDeurExpectations";
import { evaluateDeurOperationalReturnCompletion } from "../deur/services/evaluateDeurOperationalReturnCompletion";
import { resolveEffectiveDeurRevision } from "../deur/services/correction/resolveEffectiveDeurRevision";

export type RentalLineReturnReasonCode =
  | "LINE_NOT_RETURNABLE" | "DEUR_REQUIRED" | "DEUR_NOT_STARTED" | "DEUR_IN_PROGRESS"
  | "ACTIVITY_STILL_RUNNING" | "SHIFT_NOT_COMPLETED" | "COMPLETION_EVIDENCE_INCOMPLETE"
  | "DEUR_NOT_SUBMITTED" | "DEUR_OPERATIONALLY_INCOMPLETE" | "DEUR_EXPECTATION_INVALID";

export interface RentalLineReturnReadiness {
  eligible: boolean;
  reasonCodes: RentalLineReturnReasonCode[];
  lineId: string;
  deurId?: string;
  missingRequirements: string[];
  operatorMessage: string;
}

const shiftCode = (record: DeurRecord) => record.shift === "Day" ? "DAY" : record.shift === "Night" ? "NIGHT" : undefined;
const lineRecords = (line: RentalEquipmentLine, deurs: readonly DeurRecord[]) => deurs.filter((record) => record.rentalId === line.rentalId && record.rentalEquipmentLineId === line.id);

function selectOperationalRecord(records: DeurRecord[]): { record?: DeurRecord; invalid?: string } {
  const groups = new Map<string, DeurRecord[]>();
  records.forEach((record) => { const chainId = record.revision?.chainId ?? record.id; groups.set(chainId, [...(groups.get(chainId) ?? []), record]); });
  const candidates: DeurRecord[] = [];
  for (const chain of groups.values()) {
    const resolution = resolveEffectiveDeurRevision(chain);
    if (!resolution.valid) return { invalid: resolution.issues[0]?.message ?? "DEUR revision chain is invalid." };
    const candidate = resolution.pendingCorrection ?? resolution.currentEffective ?? resolution.ordered.filter((record) => !record.revision?.supersededByRevisionId).at(-1);
    if (candidate) candidates.push(candidate);
  }
  return { record: candidates.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] };
}

function blockedFor(record: DeurRecord, issues: ReturnType<typeof evaluateDeurOperationalReturnCompletion>["issues"], lineId: string): RentalLineReturnReadiness {
  const reference = record.deurNumber ?? "Digital DEUR";
  const first = issues[0];
  const message = first.code === "ACTIVITY_STILL_RUNNING" ? `${reference} has an activity still running. ${first.requirement}`
    : first.code === "SHIFT_NOT_COMPLETED" ? `${reference} shift has not been completed. ${first.requirement}`
    : first.code === "DEUR_NOT_SUBMITTED" ? `${reference} has not been submitted. ${first.requirement}`
    : `${reference} is not operationally complete. ${first.requirement}`;
  return { lineId, eligible: false, reasonCodes: issues.map((issue) => issue.code), deurId: record.id, missingRequirements: issues.map((issue) => issue.requirement), operatorMessage: message };
}

export function evaluateRentalEquipmentLineReturnReadiness(input: {
  rental: RentalRecord;
  line: RentalEquipmentLine;
  deurs: readonly DeurRecord[];
  evaluationTimestamp: string;
  liveShiftWindows?: DeurShiftWindowDefinition[];
}): RentalLineReturnReadiness {
  const base = { lineId: input.line.id };
  if (!['Released', 'Active'].includes(input.rental.status) || !['Released', 'Active'].includes(input.line.status)) return { ...base, eligible: false, reasonCodes: ["LINE_NOT_RETURNABLE"], missingRequirements: ["The Rental and Equipment Line must be Released or Active."], operatorMessage: "Only Released or Active rental equipment can be returned." };

  const snapshot = input.line.deurExpectationSnapshot;
  const policyRental: RentalRecord = snapshot ? { ...input.rental, equipmentId: input.line.equipmentId, operatorId: input.line.operatorId, assignmentId: input.line.assignmentId, deurExpectationPolicy: snapshot.policy, deurExpectationPolicyRequired: true, deurShiftWindowSnapshots: snapshot.shiftWindows } : input.rental;
  const generated = generateRentalDeurExpectations({ rental: policyRental, evaluationTimestamp: input.evaluationTimestamp, liveShiftWindows: input.liveShiftWindows });
  const fatalIssues = generated.issues.filter((issue) => !["LEGACY_DEUR_EXPECTATION_FALLBACK_USED", "LEGACY_SHIFT_WINDOW_FALLBACK_USED"].includes(issue.code));
  if (fatalIssues.length) return { ...base, eligible: false, reasonCodes: ["DEUR_EXPECTATION_INVALID"], missingRequirements: fatalIssues.map((issue) => issue.message), operatorMessage: fatalIssues[0].message };

  const records = lineRecords(input.line, input.deurs);
  const expectations = generated.expectations;
  let selectedDeurId: string | undefined;
  if (generated.policy?.frequency !== "ON_DEMAND" && expectations.length > 0) {
    for (const expectation of expectations) {
      const matching = records.filter((record) => record.workDate === expectation.workDate && (!expectation.shiftCode || shiftCode(record) === expectation.shiftCode));
      if (!matching.length) {
        const shift = expectation.shiftCode ? ` (${expectation.shiftCode} shift)` : "";
        return { ...base, eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"], missingRequirements: [`Digital DEUR for ${expectation.workDate}${shift}`], operatorMessage: `Equipment cannot be returned because the required Digital DEUR for ${expectation.workDate}${shift} has not been created. Ask the assigned operator to create and complete the Digital DEUR before returning the equipment.` };
      }
      const selected = selectOperationalRecord(matching);
      if (selected.invalid) return { ...base, eligible: false, reasonCodes: ["DEUR_EXPECTATION_INVALID"], missingRequirements: [selected.invalid], operatorMessage: selected.invalid };
      const record = selected.record!;
      selectedDeurId = record.id;
      const completion = evaluateDeurOperationalReturnCompletion(record);
      if (!completion.complete) return blockedFor(record, completion.issues, input.line.id);
    }
    return { ...base, eligible: true, reasonCodes: [], ...(selectedDeurId ? { deurId: selectedDeurId } : {}), missingRequirements: [], operatorMessage: "Rental equipment line is operationally ready for return." };
  } else if (generated.policy?.frequency === "ON_DEMAND" && records.length === 0) {
    return { ...base, eligible: true, reasonCodes: [], missingRequirements: [], operatorMessage: "No on-demand Digital DEUR was required for this line." };
  }

  for (const record of records) {
    const completion = evaluateDeurOperationalReturnCompletion(record);
    if (!completion.complete) return blockedFor(record, completion.issues, input.line.id);
  }
  return { ...base, eligible: true, reasonCodes: [], ...(records[0] ? { deurId: records[0].id } : {}), missingRequirements: [], operatorMessage: "Rental equipment line is operationally ready for return." };
}
