import type { DeurRecord } from "../types";
import { resolveEffectiveDeurRevision } from "../services/correction/resolveEffectiveDeurRevision";
import { isCalendarDate } from "./dateRules";
import type { DeurExpectation, DeurExpectationPeriodStatus } from "./generateRentalDeurExpectations";
import type { DeurExpectationDisposition } from "../../remote/contracts";

export type DeurExpectationMatchStatus = "NOT_YET_DUE" | "CURRENT" | "COMPLIANT" | "WAIVED" | "MISSING" | "INCOMPLETE" | "PENDING_CORRECTION";
export interface RentalDeurExpectationResult extends Omit<DeurExpectation, "status"> { expectationStatus: DeurExpectationPeriodStatus; status: DeurExpectationMatchStatus; matchingEffectiveDeurId?: string; matchingDeurNumber?: string; matchingRevisionNumber?: number; reason: string; issueCode?: string }
const identityMatches = (expectation: DeurExpectation, record: DeurRecord) => record.rentalId === expectation.rentalId
  && (!expectation.rentalEquipmentLineId || record.rentalEquipmentLineId === expectation.rentalEquipmentLineId)
  && record.workDate === expectation.workDate;

export function matchDeursToExpectations({ expectations, deurs, dispositions=[] }: { expectations: DeurExpectation[]; deurs: DeurRecord[]; dispositions?:DeurExpectationDisposition[] }) {
  const canonical = structuredClone(deurs).filter((record) => record.legacy !== true && isCalendarDate(record.workDate));
  const groups = new Map<string, DeurRecord[]>();
  canonical.forEach((record) => { const key = record.revision?.chainId ?? record.id; groups.set(key, [...(groups.get(key) ?? []), record]); });
  const chains = [...groups.values()].map((records) => ({ records, resolution: resolveEffectiveDeurRevision(records) }));
  const issues: Array<{ code: string; message: string }> = [];
  chains.filter((chain) => !chain.resolution.valid).forEach((chain) => issues.push(...chain.resolution.issues.map((item) => ({ code: "DEUR_EXPECTATION_REVISION_CHAIN_INVALID", message: item.message }))));
  const results = expectations.map<RentalDeurExpectationResult>((expectation) => {
    const base = { ...expectation, expectationStatus: expectation.status };
    const affecting = chains.filter((chain) => chain.records.some((record) => identityMatches(expectation, record)));
    if (affecting.some((chain) => !chain.resolution.valid)) return { ...base, status: "MISSING", reason: "Revision chain is invalid.", issueCode: "DEUR_EXPECTATION_REVISION_CHAIN_INVALID" };
    const pending = affecting.find((chain) => chain.resolution.pendingCorrection);
    if (pending) return { ...base, status: "PENDING_CORRECTION", reason: "A correction revision is awaiting resolution.", matchingEffectiveDeurId: pending.resolution.currentEffective?.id, matchingDeurNumber: pending.resolution.currentEffective?.deurNumber };
    const effective = affecting.flatMap((chain) => {
      const record = chain.resolution.currentEffective ?? chain.resolution.ordered.find((item) => item.status === "Billed" && !item.revision?.supersededByRevisionId);
      return record && identityMatches(expectation, record) ? [record] : [];
    });
    if (effective.length === 1) return { ...base, status: "COMPLIANT", reason: "Effective DEUR is acknowledged.", matchingEffectiveDeurId: effective[0].id, matchingDeurNumber: effective[0].deurNumber, matchingRevisionNumber: effective[0].revision?.revisionNumber ?? 1 };
    if (effective.length > 1) return { ...base, status: "MISSING", reason: "Multiple unrelated effective DEURs match this expectation.", issueCode: "DEUR_EXPECTATION_DUPLICATE_MATCH" };
    const incomplete = affecting.flatMap((chain) => chain.records).find((record) => ["Draft", "In Progress", "Submitted", "Pending Acknowledgement"].includes(record.status) && !record.revision?.previousRevisionId && identityMatches(expectation, record));
    if (incomplete) return { ...base, status: "INCOMPLETE", reason: expectation.status === "DUE" ? "Reporting period completed; DEUR is awaiting acknowledgement." : "DEUR is in progress; the reporting period has not completed.", matchingEffectiveDeurId: incomplete.id, matchingDeurNumber: incomplete.deurNumber, matchingRevisionNumber: incomplete.revision?.revisionNumber ?? 1 };
    const waiver=dispositions.find(item=>item.disposition==="WAIVED"&&item.rentalId===expectation.rentalId&&item.rentalEquipmentLineId===expectation.rentalEquipmentLineId&&item.workDate===expectation.workDate&&item.expectationFingerprint===expectation.expectationFingerprint);
    if(waiver)return{...base,status:"WAIVED",reason:waiver.reason};
    if (expectation.status !== "DUE") return { ...base, status: expectation.status, reason: expectation.status === "CURRENT" ? "Reporting period is still in progress." : "Reporting period has not started." };
    return { ...base, status: "MISSING", reason: "Reporting period completed; no DEUR was recorded.", issueCode: "DEUR_EXPECTATION_MISSING" };
  });
  return { results: structuredClone(results), issues: structuredClone(issues) };
}
