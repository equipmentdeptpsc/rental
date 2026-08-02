import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalContractRecord } from "../types/RentalContract";
import type { DeurShiftWindowDefinition, RentalLineDeurExpectationSnapshot, RentalRecord } from "../types";
import { freezeRentalDeurExpectationPolicy } from "../deur/expectation/freezeRentalDeurExpectationPolicy";
import { getDeurMeterRequirement } from "../deur/services/getDeurMeterRequirement";

export type RentalReleaseMissingField =
  | "rentalLineIdentity" | "equipment" | "assignment" | "operator" | "project" | "customer"
  | "deurPolicy" | "requiredShift" | "shiftWindow" | "workDescription" | "workDate"
  | "meterConfiguration" | "billingTerms" | "operationalMetadata" | "snapshot" | "snapshotFreshness";
export type RentalReleaseReasonCode = "RELEASE_NOT_READY" | "NO_ACTIVE_LINES" | "DUPLICATE_LINE_IDENTITY" | "LINE_INCOMPLETE" | "STALE_SNAPSHOT";
export interface RentalReleaseLineReadiness {
  rentalEquipmentLineId: string;
  equipmentId?: string;
  eligible: boolean;
  missingFields: RentalReleaseMissingField[];
  invalidValues: string[];
  snapshot?: RentalLineDeurExpectationSnapshot;
}
export interface RentalReleaseReadinessResult {
  eligible: boolean;
  reasonCodes: RentalReleaseReasonCode[];
  rentalId: string;
  incompleteEquipmentLines: RentalReleaseLineReadiness[];
  lines: RentalReleaseLineReadiness[];
}

interface Input {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  equipment: EquipmentRecord[];
  projects: ProjectRecord[];
  contracts: RentalContractRecord[];
  workDescriptions: WorkDescriptionRecord[];
  shiftWindows: DeurShiftWindowDefinition[];
  timestamp: string;
}

const normalized = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
};

function sourceFingerprint(input: Omit<RentalLineDeurExpectationSnapshot, "sourceFingerprint" | "capturedAt">): string {
  const stripCaptureTimes = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripCaptureTimes);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "capturedAt").map(([key, item]) => [key, stripCaptureTimes(item)]));
  };
  return stable(stripCaptureTimes(input));
}

function candidateFor(input: Input, line: RentalEquipmentLine): RentalReleaseLineReadiness {
  const missing = new Set<RentalReleaseMissingField>();
  const invalid: string[] = [];
  if (!normalized(line.id) || line.rentalId !== input.rental.id) missing.add("rentalLineIdentity");
  const machine = input.equipment.find((item) => item.id === line.equipmentId && item.active !== false && !item.deleted);
  if (!machine) missing.add("equipment");
  const assignment = input.assignments.find((item) => item.id === line.assignmentId);
  if (!assignment || assignment.status !== "Active" || assignment.equipmentId !== line.equipmentId || assignment.operatorId !== line.operatorId || assignment.projectId !== input.rental.projectId) missing.add("assignment");
  const operator = input.operators.find((item) => item.id === line.operatorId && item.status === "Active");
  if (!operator) missing.add("operator");
  const project = input.projects.find((item) => item.id === input.rental.projectId && item.status === "Active" && !item.deleted);
  if (!project) missing.add("project");
  if (!normalized(input.rental.customerId) && !normalized(input.rental.customer)) missing.add("customer");
  if (!normalized(input.rental.dateOut)) missing.add("workDate");

  const frozen = freezeRentalDeurExpectationPolicy(input.rental, input.timestamp, input.shiftWindows);
  if (input.rental.deurExpectationPolicyRequired === true && !input.rental.deurExpectationPolicy) missing.add("deurPolicy");
  if (!frozen.success || !frozen.rental.deurExpectationPolicy) {
    missing.add("deurPolicy");
    if (!frozen.success) invalid.push(frozen.message);
  }
  if (input.rental.deurExpectationPolicy?.frequency === "PER_SHIFT") {
    const expected = input.rental.deurExpectationPolicy.expectedShiftCodes ?? [];
    if (!expected.length) missing.add("requiredShift");
    if (!frozen.success || (frozen.rental.deurShiftWindowSnapshots?.length ?? 0) !== new Set(expected).size) missing.add("shiftWindow");
  }

  const work = input.workDescriptions.find((item) => item.id === line.deurWorkDescriptionId);
  if (!work || !work.active || work.deleted || work.operatorSelectable === false || !normalized(work.name)) missing.add("workDescription");
  if (work?.requiresRemarks === true && !normalized(line.deurOperationalRemarks)) missing.add("workDescription");
  const metadata = line.operationalMetadata;
  if (!normalized(metadata?.costCode?.code) || !normalized(metadata?.costCode?.name) || !normalized(metadata?.activityCode?.code) || !normalized(metadata?.activityCode?.name)) missing.add("operationalMetadata");
  const contract = input.contracts.find((item) => item.rentalEquipmentLineId === line.id && item.status !== "Cancelled");
  if ((input.rental.commercialSnapshotRequired === true || line.commercialSnapshotRequired === true) && !contract) missing.add("billingTerms");
  const meter = getDeurMeterRequirement({ billingMethod: contract?.billingMethod, commercialTerms: line.commercialSnapshot });
  if ((meter.kind === "odometer" || meter.kind === "both") && machine && machine.maintenanceType !== "Kilometers" && machine.maintenanceType !== "Mileage") missing.add("meterConfiguration");
  if ((meter.kind === "hourMeter" || meter.kind === "both") && machine && machine.maintenanceType !== "Engine Hours") missing.add("meterConfiguration");

  let snapshot: RentalLineDeurExpectationSnapshot | undefined;
  const billingMethod = contract?.billingMethod ?? line.commercialSnapshot?.billingMethod ?? input.rental.billingMethod;
  if (!billingMethod) missing.add("billingTerms");
  if (missing.size === 0 && frozen.success && frozen.rental.deurExpectationPolicy && work && metadata && billingMethod) {
    const body: Omit<RentalLineDeurExpectationSnapshot, "sourceFingerprint" | "capturedAt"> = {
      rentalEquipmentLineId: line.id, rentalId: input.rental.id, equipmentId: line.equipmentId,
      assignmentId: line.assignmentId!, operatorId: line.operatorId, projectId: input.rental.projectId!,
      ...(input.rental.customerId ? { customerId: input.rental.customerId } : {}),
      policy: frozen.rental.deurExpectationPolicy, shiftWindows: frozen.rental.deurShiftWindowSnapshots ?? [],
      workDescription: { ...(work.id ? { id: work.id } : {}), ...(normalized(work.code) ? { code: work.code.trim() } : {}), name: work.name.trim(), requiresRemarks: work.requiresRemarks === true },
      ...(normalized(line.deurOperationalRemarks) ? { operationalRemarks: line.deurOperationalRemarks!.trim() } : {}),
      workDateRule: "RENTAL_DATE_OUT", workDate: input.rental.dateOut,
      meterRequirement: meter.kind, fuelEvidenceRequired: Number(contract?.fuelCharge ?? 0) > 0,
      billingMethod, operationalMetadata: structuredClone(metadata),
    };
    snapshot = { ...body, sourceFingerprint: sourceFingerprint(body), capturedAt: new Date(input.timestamp).toISOString() };
    if (!line.deurExpectationSnapshot) missing.add("snapshot");
    else if (line.deurExpectationSnapshot.sourceFingerprint !== snapshot.sourceFingerprint) missing.add("snapshotFreshness");
  }
  return { rentalEquipmentLineId: line.id, ...(line.equipmentId ? { equipmentId: line.equipmentId } : {}), eligible: missing.size === 0, missingFields: [...missing], invalidValues: invalid, ...(snapshot ? { snapshot } : {}) };
}

export function evaluateRentalReleaseReadiness(input: Input): RentalReleaseReadinessResult {
  const active = input.lines.filter((line) => line.rentalId === input.rental.id && line.status !== "Cancelled");
  const duplicateIds = new Set(active.filter((line, index) => active.findIndex((item) => item.id === line.id) !== index).map((line) => line.id));
  const lines = active.map((line) => {
    const result = candidateFor(input, line);
    if (duplicateIds.has(line.id)) return { ...result, eligible: false, missingFields: [...new Set([...result.missingFields, "rentalLineIdentity" as const])], invalidValues: [...result.invalidValues, "Duplicate rental equipment line identity."] };
    return result;
  });
  const reasonCodes: RentalReleaseReasonCode[] = [];
  if (!active.length) reasonCodes.push("NO_ACTIVE_LINES");
  if (duplicateIds.size) reasonCodes.push("DUPLICATE_LINE_IDENTITY");
  if (lines.some((line) => line.missingFields.includes("snapshotFreshness"))) reasonCodes.push("STALE_SNAPSHOT");
  if (lines.some((line) => !line.eligible)) reasonCodes.push("LINE_INCOMPLETE");
  if (reasonCodes.length) reasonCodes.unshift("RELEASE_NOT_READY");
  return { eligible: reasonCodes.length === 0, reasonCodes, rentalId: input.rental.id, incompleteEquipmentLines: lines.filter((line) => !line.eligible), lines };
}

export function regenerateRentalLineDeurExpectation(input: Input, lineId: string): RentalReleaseLineReadiness {
  const line = input.lines.find((item) => item.id === lineId);
  if (!line) return { rentalEquipmentLineId: lineId, eligible: false, missingFields: ["rentalLineIdentity"], invalidValues: ["Rental equipment line was not found."] };
  const withoutStored = { ...line, deurExpectationSnapshot: undefined };
  const result = candidateFor(input, withoutStored);
  return result.snapshot ? { ...result, eligible: result.missingFields.every((item) => item === "snapshot"), missingFields: result.missingFields.filter((item) => item !== "snapshot") } : result;
}
