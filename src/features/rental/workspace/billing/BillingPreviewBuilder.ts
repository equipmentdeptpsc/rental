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
        !deur.billingLocked
    )

    .filter(
      deur =>
        deur.workDate >= from &&
        deur.workDate <= to
    )

    .map(deur => {

      const operatingHours =
        deur.totalOperatingMinutes / 60;

      /**
       * Batch 9.2.2
       * Billing Engine
       */
      const quantity =
        operatingHours;

      const rate =
        contract.unitRate;

      const amount =
        quantity * rate;

      return {

        deurId:
          deur.id,

        workDate:
          deur.workDate,

        operator:
          deur.operatorId,

        operatingHours,

        actualHours:
          operatingHours,

          billingMethod:
          contract.billingMethod,  

        costCode: "",

        description:
          `Equipment Rental (${contract.billingMethod})`,

        hourlyRate:
          rate,

        amount,

      };

    });

}