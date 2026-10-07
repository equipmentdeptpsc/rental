import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalContractRecord } from "../types/RentalContract";
import type { DeurRecord } from "../deur/types";
import { evaluateDeurBillingEligibility, type DeurBillingEligibilityReasonCode } from "../deur/billing/evaluateDeurBillingEligibility";
import { mapRentalContractToBillingCalculationTerms } from "./engine/mapRentalContractToBillingCalculationTerms";
import { resolveDeurBillingCalculationTerms } from "./engine/resolveDeurBillingCalculationTerms";

export interface RentalBillingReadinessIssue {
  rentalEquipmentLineId: string;
  deurId?: string;
  deurNumber?: string;
  revisionNumber?: number;
  equipmentId?: string;
  code: DeurBillingEligibilityReasonCode | "DEUR_NOT_FOUND" | "COMMERCIAL_SNAPSHOT_REQUIRED" | "AMBIGUOUS_LEGACY_COMMERCIAL_TERMS";
  message: string;
}

export interface RentalBillingReadiness {
  ready: boolean;
  effectiveDeurs: DeurRecord[];
  issues: RentalBillingReadinessIssue[];
}

const effectiveDeurForLine = (line: RentalEquipmentLine, deurs: readonly DeurRecord[]) => deurs
  .filter((record) => (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === line.id : record.equipmentId === line.equipmentId) && !record.revision?.supersededByRevisionId)
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

/**
 * Uses the same per-DEUR canonical eligibility evaluator as billing preview,
 * but performs no persistence or billing mutation.
 */
export function resolveRentalBillingReadiness(input: {
  rentalEquipmentLines: readonly RentalEquipmentLine[];
  deurs: readonly DeurRecord[];
  contract?: RentalContractRecord;
}): RentalBillingReadiness {
  const effectiveDeurs = input.rentalEquipmentLines
    .map((line) => effectiveDeurForLine(line, input.deurs))
    .filter((record): record is DeurRecord => Boolean(record));
  const issues: RentalBillingReadinessIssue[] = [];
  const fallback = input.contract ? mapRentalContractToBillingCalculationTerms(input.contract) : undefined;

  input.rentalEquipmentLines.forEach((line) => {
    const deur = effectiveDeurForLine(line, input.deurs);
    if (!deur) {
      issues.push({ rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, code: "DEUR_NOT_FOUND", message: "No effective DEUR evidence has been recorded." });
      return;
    }
    if (!deur.commercialSnapshot && !fallback) {
      issues.push({ rentalEquipmentLineId: line.id, deurId: deur.id, deurNumber: deur.deurNumber, revisionNumber: deur.revision?.revisionNumber, equipmentId: deur.equipmentId, code: "COMMERCIAL_SNAPSHOT_REQUIRED", message: "DEUR embedded commercial snapshot is required for line-aware billing." });
      return;
    }
    if (!deur.commercialSnapshot && input.rentalEquipmentLines.length !== 1) {
      issues.push({ rentalEquipmentLineId: line.id, deurId: deur.id, deurNumber: deur.deurNumber, revisionNumber: deur.revision?.revisionNumber, equipmentId: deur.equipmentId, code: "AMBIGUOUS_LEGACY_COMMERCIAL_TERMS", message: "Legacy multi-line DEUR has no embedded commercial snapshot." });
      return;
    }
    const resolved = resolveDeurBillingCalculationTerms(deur, fallback!);
    const chainId = deur.revision?.chainId ?? deur.id;
    const revisionChain = input.deurs.filter((record) => (record.revision?.chainId ?? record.id) === chainId);
    const eligibility = evaluateDeurBillingEligibility({ deur, billingMethod: resolved.terms.billingMethod, unitRate: resolved.terms.unitRate, revisionChain });
    if (!eligibility.eligible) {
      issues.push({ rentalEquipmentLineId: line.id, deurId: deur.id, deurNumber: deur.deurNumber, revisionNumber: deur.revision?.revisionNumber, equipmentId: deur.equipmentId, code: eligibility.reasonCode, message: eligibility.reason });
    }
  });

  return { ready: input.rentalEquipmentLines.length > 0 && issues.length === 0 && effectiveDeurs.length === input.rentalEquipmentLines.length, effectiveDeurs, issues };
}
