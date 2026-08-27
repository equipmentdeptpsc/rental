import {
  BillingRateEngine,
  mapRentalContractToBillingCalculationTerms,
} from "@/features/rental/billing/engine";

import type {
  DeurRecord,
} from "@/features/rental/deur";

import type {
  RentalContractRecord,
} from "@/features/rental/types/RentalContract";

import type {
  BillingPreviewLine,
} from "./types";
import { resolveEffectiveDeurRevision } from "@/features/rental/deur/services/correction/resolveEffectiveDeurRevision";

export function buildBillingPreview(
  deurs: DeurRecord[],
  contract: RentalContractRecord,
  from: string,
  to: string
): BillingPreviewLine[] {
  const terms = mapRentalContractToBillingCalculationTerms(contract);

  return getCompletedDeursForBillingPeriod(deurs, from, to)

    .map(deur => {

      const charges =
        BillingRateEngine.calculate(
          deur,
          terms
        );

      return {

        deurId:
          deur.id,

        deurReference:
          getDeurPreviewReference(deur),

        workDate:
          deur.workDate,

        operator:
          deur.operatorId,

        operatingHours:
          charges.operatingHours,

        actualHours:
          charges.operatingHours,

        billingMethod:
          contract.billingMethod,

        costCode: "",

        description:
          `Equipment Rental (${contract.billingMethod})`,

        hourlyRate:
          contract.unitRate,

        amount:
          charges.subtotal,

      };

    });

}

export function getCompletedDeursForBillingPeriod(
  deurs: DeurRecord[],
  from: string,
  to: string
): DeurRecord[] {
  const chains = new Map<string, DeurRecord[]>();
  for (const deur of deurs) {
    const key = deur.revision?.chainId ?? deur.id;
    chains.set(key, [...(chains.get(key) ?? []), deur]);
  }
  return [...chains.values()].flatMap((chain) => {
    const resolved = resolveEffectiveDeurRevision(chain);
    const compatibilityCompleted = chain.filter(item=>!item.revision?.supersededByRevisionId&&(
      Boolean(item.endOfDay) || item.events?.some(event=>event.activityType==="shift"&&event.action==="end")
    )&&["Submitted","Pending Acknowledgement"].includes(item.status)).at(-1);
    const hasRevision=chain.some(item=>Boolean(item.revision));
    const deur = resolved.valid ? resolved.currentEffective ?? (!hasRevision?compatibilityCompleted:undefined) : undefined;
    if (!deur || deur.billingLocked) return [];
    const date = deur.reportDate ?? deur.workDate;
    return date >= from && date <= to ? [deur] : [];
  });
}

export function getDeurPreviewReference(deur: DeurRecord): string {
  return deur.deurNumber?.trim() || "DEUR number unavailable";
}

export function resolveDefaultBillingPeriodDate(deurs: readonly DeurRecord[], today: string): string {
  return deurs
    .filter((record) => !record.billingLocked)
    .map((record) => record.reportDate ?? record.workDate)
    .sort()
    .at(-1) ?? today;
}
