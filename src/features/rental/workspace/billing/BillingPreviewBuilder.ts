import {
  BillingRateEngine,
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

  return deurs

    .filter(
      deur =>
        !deur.billingLocked && Boolean(deur.endOfDay)
    )

    .filter(
      deur =>
        deur.workDate >= from &&
        deur.workDate <= to
    )

    .map(deur => {

      const charges =
        BillingRateEngine.calculate(
          deur,
          contract
        );

      return {

        deurId:
          deur.id,

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
