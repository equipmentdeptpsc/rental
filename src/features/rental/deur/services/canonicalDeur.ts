import type { DeurCorrectionReasonCode, DeurOperationalCodeSnapshot, DeurOperationalMetadataSnapshot, DeurRecord, DeurRevisionMetadata, DeurTotals, DeurWorkDescriptionSnapshot, ManualDeurMetadata, ManualDeurReason } from "../types";
import { normalizeCompletionEvidence,normalizeOdometerTripEvidence,normalizeQuantityEvidence } from "./deurEvidence";
import { normalizeRentalCommercialSnapshot } from "../../services/createRentalCommercialSnapshot";

const NUMBER_PATTERN = /^DEUR-(\d{6})$/i;
export const emptyDeurTotals = (): DeurTotals => ({ shiftMinutes: 0, operationMinutes: 0, idleMinutes: 0, mealBreakMinutes: 0, breakdownMinutes: 0 });

function normalizeCode(value: unknown): DeurOperationalCodeSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!code || !name) return undefined;
  return { ...(typeof candidate.id === "string" && candidate.id.trim() ? { id: candidate.id.trim() } : {}), code, name };
}

function normalizeWorkDescription(value: unknown): DeurWorkDescriptionSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name || typeof candidate.requiresRemarks !== "boolean") return undefined;
  const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
  return {
    ...(typeof candidate.id === "string" && candidate.id.trim() ? { id: candidate.id.trim() } : {}),
    ...(code ? { code } : {}), name, requiresRemarks: candidate.requiresRemarks,
  };
}

function normalizeOperationalMetadata(value: unknown): DeurOperationalMetadataSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const costCode = normalizeCode(candidate.costCode);
  const activityCode = normalizeCode(candidate.activityCode);
  const workDescription = normalizeWorkDescription(candidate.workDescription);
  return { ...(costCode ? { costCode } : {}), ...(activityCode ? { activityCode } : {}), ...(workDescription ? { workDescription } : {}) };
}

const manualReasons = new Set<ManualDeurReason>(["POWER_NOT_AVAILABLE","SITE_COMPUTER_NOT_AVAILABLE","TECHNICAL_DIFFICULTY","DEVICE_MALFUNCTION","OPERATOR_DEVICE_NOT_ISSUED","APPLICATION_UNAVAILABLE","INTERNET_UNAVAILABLE","DELAYED_DIGITAL_DEPLOYMENT","PHYSICAL_DEUR_USED_AS_BACKUP","OTHER"]);
const correctionReasons = new Set<DeurCorrectionReasonCode>(["INCORRECT_TIME_ENTRY","MISSING_TIME_ENTRY","INCORRECT_ACTIVITY","INCORRECT_WORK_DESCRIPTION","INCORRECT_COST_CODE","INCORRECT_ODOMETER","INCORRECT_TRIP_CHECKPOINT","INCORRECT_QUANTITY","INCORRECT_OPERATOR","INCORRECT_PROJECT","INCORRECT_EQUIPMENT","INCORRECT_COMMERCIAL_REFERENCE","CUSTOMER_REQUESTED_CORRECTION","DATA_ENCODING_ERROR","OTHER"]);

function normalizeRevision(value: unknown): DeurRevisionMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const text = (key: string) => typeof item[key] === "string" && item[key].trim() ? item[key].trim() : undefined;
  const chainId = text("chainId"), originalDeurId = text("originalDeurId");
  const revisionNumber = item.revisionNumber;
  if (!chainId || !originalDeurId || !Number.isInteger(revisionNumber) || Number(revisionNumber) < 1) return undefined;
  const reason = text("correctionReasonCode") as DeurCorrectionReasonCode | undefined;
  const timestamp = (key: string) => {
    const candidate = text(key);
    return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : undefined;
  };
  return {
    chainId, revisionNumber: Number(revisionNumber), originalDeurId,
    ...(text("previousRevisionId") ? { previousRevisionId: text("previousRevisionId") } : {}),
    ...(reason && correctionReasons.has(reason) ? { correctionReasonCode: reason } : {}),
    ...(text("correctionReasonDetails") ? { correctionReasonDetails: text("correctionReasonDetails") } : {}),
    ...(text("correctedByName") ? { correctedByName: text("correctedByName") } : {}),
    ...(text("correctedByUserId") ? { correctedByUserId: text("correctedByUserId") } : {}),
    ...(timestamp("correctedAt") ? { correctedAt: timestamp("correctedAt") } : {}),
    ...(text("supersedesRevisionId") ? { supersedesRevisionId: text("supersedesRevisionId") } : {}),
    ...(text("supersededByRevisionId") ? { supersededByRevisionId: text("supersededByRevisionId") } : {}),
    ...(timestamp("supersededAt") ? { supersededAt: timestamp("supersededAt") } : {}),
    ...(text("supersededByName") ? { supersededByName: text("supersededByName") } : {}),
  };
}
function normalizeManualMetadata(value: unknown): ManualDeurMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item=value as Record<string,unknown>,reason=String(item.reason??"") as ManualDeurReason;
  const encodedByName=typeof item.encodedByName==="string"?item.encodedByName.trim():"",encodedAt=typeof item.encodedAt==="string"?item.encodedAt.trim():"",physicalDeurReference=typeof item.physicalDeurReference==="string"?item.physicalDeurReference.trim():"";
  if(!manualReasons.has(reason)||!encodedByName||!Number.isFinite(Date.parse(encodedAt))||!physicalDeurReference||typeof item.operatorConfirmed!=="boolean")return undefined;
  const optional=(key:string)=>typeof item[key]==="string"&&item[key].trim()?item[key].trim():undefined;
  return {reason,...(optional("reasonDetails")?{reasonDetails:optional("reasonDetails")} : {}),...(optional("encodedByUserId")?{encodedByUserId:optional("encodedByUserId")} : {}),encodedByName,encodedAt,physicalDeurReference,...(optional("sourceDocumentDate")?{sourceDocumentDate:optional("sourceDocumentDate")} : {}),operatorConfirmed:item.operatorConfirmed,...(optional("operatorConfirmedAt")?{operatorConfirmedAt:optional("operatorConfirmedAt")} : {}),...(optional("operatorConfirmedByName")?{operatorConfirmedByName:optional("operatorConfirmedByName")} : {}),...(optional("remarks")?{remarks:optional("remarks")} : {})};
}

export function generateDeurNumber(records: DeurRecord[]) {
  const highest = records.reduce((max, record) => {
    const match = NUMBER_PATTERN.exec(record.deurNumber ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `DEUR-${String(highest + 1).padStart(6, "0")}`;
}

export function normalizeDeur(record: DeurRecord): DeurRecord {
  const events = Array.isArray(record.events) ? record.events : [];
  return {
    ...structuredClone(record),
    revision: normalizeRevision(record.revision),
    shift: record.shift === "Day" || record.shift === "Night" ? record.shift : undefined,
    operationalMetadata: normalizeOperationalMetadata(record.operationalMetadata),
    operationalRemarks: typeof record.operationalRemarks === "string" && record.operationalRemarks.trim() ? record.operationalRemarks.trim() : undefined,
    creationSource: record.creationSource === "OPERATOR_DIGITAL" || record.creationSource === "RENTAL_COMPANY_MANUAL" ? record.creationSource : undefined,
    manualMetadata: record.creationSource === "RENTAL_COMPANY_MANUAL" ? normalizeManualMetadata(record.manualMetadata) : undefined,
    evidenceMode: ["TIME_TIMELINE","ODOMETER_TRIP","QUANTITY","COMPLETION"].includes(String(record.evidenceMode)) ? record.evidenceMode : undefined,
    billingMethodSnapshot: typeof record.billingMethodSnapshot==="string"&&record.billingMethodSnapshot.trim()?record.billingMethodSnapshot.trim():undefined,
    commercialSnapshot:normalizeRentalCommercialSnapshot(record.commercialSnapshot),commercialSnapshotRequired:record.commercialSnapshotRequired===true?true:undefined,
    odometerTripEvidence: record.evidenceMode==="ODOMETER_TRIP"?normalizeOdometerTripEvidence(record.odometerTripEvidence):undefined,
    quantityEvidence: record.evidenceMode==="QUANTITY"?normalizeQuantityEvidence(record.quantityEvidence):undefined,
    completionEvidence: record.evidenceMode==="COMPLETION"?normalizeCompletionEvidence(record.completionEvidence):undefined,
    reportDate: record.reportDate ?? record.workDate,
    events,
    totals: record.totals ? { ...record.totals, breakdownMinutes: record.totals.breakdownMinutes ?? 0 } : {
      shiftMinutes: 0,
      operationMinutes: Math.round(record.totalOperatingMinutes ?? 0),
      idleMinutes: Math.round(record.totalIdleMinutes ?? 0),
      mealBreakMinutes: Math.round(record.totalMealBreakMinutes ?? 0),
      breakdownMinutes: 0,
    },
    legacy: record.legacy ?? events.length === 0,
  };
}

export function isCanonicalBillingEligible(record: DeurRecord) {
  return !record.legacy && record.status === "Acknowledged" && !record.billingLocked;
}
