import { evaluateDeurBillingEligibility } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingMethod } from "@/features/rental/types/RentalContract";

export type BillingBlockerCategory =
  | "Awaiting customer acknowledgement"
  | "Pending correction"
  | "Incomplete DEUR"
  | "Billing setup incomplete"
  | "Other canonical blocking state";

export interface CanonicalBillingVisibility {
  readyForBilling: number;
  blockers: Record<BillingBlockerCategory, number>;
  blockerCount: number;
}

const categories: BillingBlockerCategory[] = [
  "Awaiting customer acknowledgement",
  "Pending correction",
  "Incomplete DEUR",
  "Billing setup incomplete",
  "Other canonical blocking state",
];

function blockerCategory(deur: DeurRecord, reasonCode: string): BillingBlockerCategory {
  if (["Submitted", "Pending Acknowledgement"].includes(deur.status)) return "Awaiting customer acknowledgement";
  if (deur.status === "Rejected" || reasonCode.startsWith("DEUR_CORRECTION") || reasonCode.startsWith("DEUR_REVISION")) return "Pending correction";
  if (["Draft", "In Progress"].includes(deur.status)) return "Incomplete DEUR";
  if (reasonCode.includes("COMMERCIAL") || reasonCode.includes("UNIT_RATE") || reasonCode === "UNKNOWN_BILLING_METHOD") return "Billing setup incomplete";
  return "Other canonical blocking state";
}

/**
 * Projects billing readiness from canonical DEUR evidence only. It intentionally
 * does not calculate receivables: canonical collection reads are not available.
 */
export function summarizeCanonicalBillingVisibility(deurs: readonly DeurRecord[]): CanonicalBillingVisibility {
  const blockers = Object.fromEntries(categories.map((category) => [category, 0])) as Record<BillingBlockerCategory, number>;
  let readyForBilling = 0;

  for (const deur of deurs) {
    const revisionChain = deur.revision?.chainId
      ? deurs.filter((candidate) => candidate.revision?.chainId === deur.revision?.chainId)
      : undefined;
    const result = evaluateDeurBillingEligibility({
      deur,
      billingMethod: deur.commercialSnapshot?.billingMethod as BillingMethod | undefined,
      unitRate: deur.commercialSnapshot?.unitRate,
      revisionChain,
    });
    if (result.eligible) readyForBilling += 1;
    else blockers[blockerCategory(deur, result.reasonCode)] += 1;
  }

  return {
    readyForBilling,
    blockers,
    blockerCount: Object.values(blockers).reduce((total, count) => total + count, 0),
  };
}
