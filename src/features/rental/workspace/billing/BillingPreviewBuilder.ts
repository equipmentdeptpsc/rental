import type {
  DeurRecord,
} from "@/features/rental/deur";

import type {
  BillingPreviewLine,
} from "./types";

export function buildBillingPreview(
  deurs: DeurRecord[],
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

      const hours =
        deur.totalOperatingMinutes / 60;

      return {

        deurId: deur.id,

        workDate:
          deur.workDate,

        operator:
          deur.operatorId,

        operatingHours:
          hours,

        actualHours:
          hours,

        costCode: "",

        description:
          `Equipment Rental - ${deur.workDate}`,

        hourlyRate: 0,

        amount: 0,

      };

    });

}