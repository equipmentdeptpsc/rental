import type {
  DeurRecord,
} from "@/features/rental/deur";

import type {
  BillingChargeResult,
} from "./BillingChargeResult";
import type { BillingCalculationTerms } from "./BillingCalculationTerms";

export class BillingRateEngine {
  static calculate(
    deur: DeurRecord,
    terms: BillingCalculationTerms
  ): BillingChargeResult {

    let operatingHours =
      deur.totalOperatingMinutes / 60;

    const idleHours =
      deur.totalIdleMinutes / 60;

    const mobilizationHours =
      deur.totalMobilizationMinutes / 60;

    const demobilizationHours =
      deur.totalDemobilizationMinutes / 60;

    //
    // Minimum Billable Hours
    //
    if (
      terms.minimumBillableHours &&
      operatingHours <
        terms.minimumBillableHours
    ) {
      operatingHours =
        terms.minimumBillableHours;
    }

    const unitRate =
      terms.unitRate;

    //
    // Operating Charge
    //
    let operatingCharge = 0;

    switch (terms.billingMethod) {

      case "Per Hour":
        operatingCharge =
          operatingHours * unitRate;
        break;

      case "Per Day":
        operatingCharge =
          unitRate;
        break;

      case "Per Week":
        operatingCharge =
          unitRate;
        break;

      case "Per Month":
        operatingCharge =
          unitRate;
        break;

      case "Per Cubic Meter":
        operatingCharge =
          0;
        break;

      case "One Lot":
        operatingCharge =
          terms.contractAmount ??
          unitRate;
        break;
    }

    //
    // Idle Charge
    //
    const idleCharge =
      idleHours *
      (terms.standbyRate ?? 0);

    //
    // Mobilization
    //
    const mobilizationCharge =
      terms.mobilizationFee ?? 0;

    //
    // Demobilization
    //
    const demobilizationCharge =
      terms.demobilizationFee ?? 0;

    //
    // Operator
    //
    const operatorCharge =
      terms.operatorIncluded
        ? 0
        : (terms.operatorRate ?? 0);

    //
    // Fuel
    //
    const fuelCharge =
      terms.fuelCharge ?? 0;

    //
    // Subtotal
    //
    const subtotal =
      operatingCharge +
      idleCharge +
      mobilizationCharge +
      demobilizationCharge +
      operatorCharge +
      fuelCharge;

    //
    // VAT
    //
    const vat =
      subtotal *
      ((terms.taxRate ?? 0) / 100);

    //
    // Withholding Tax
    //
    const withholdingTax =
      subtotal *
      ((terms.withholdingTax ?? 0) / 100);

    //
    // Grand Total
    //
    const grandTotal =
      subtotal +
      vat -
      withholdingTax;

    return {

      operatingHours,

      idleHours,

      mobilizationHours,

      demobilizationHours,

      operatingCharge,

      idleCharge,

      mobilizationCharge,

      demobilizationCharge,

      operatorCharge,

      fuelCharge,

      subtotal,

      vat,

      withholdingTax,

      grandTotal,

    };

  }
}
