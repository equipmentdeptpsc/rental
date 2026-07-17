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
  return deurs.filter(
    deur =>
      !deur.billingLocked &&
      Boolean(deur.endOfDay) &&
      deur.workDate >= from &&
      deur.workDate <= to
  );
}

export function getDeurPreviewReference(deur: DeurRecord): string {
  return deur.deurNumber?.trim() || deur.id;
}
