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

    const isQuantityBilling = terms.billingMethod === "Per Kilometer" || terms.billingMethod === "Per Trip" || terms.billingMethod === "Per Cubic Meter";
    let operatingHours = isQuantityBilling ? 0 : deur.totalOperatingMinutes / 60;

    const standbyHours = isQuantityBilling ? 0 : (deur.totalStandbyMinutes ?? 0) / 60;

    const mobilizationHours =
      deur.totalMobilizationMinutes / 60;

    const demobilizationHours =
      deur.totalDemobilizationMinutes / 60;

    //
    // Minimum Billable Hours
    //
    if (
      !isQuantityBilling && terms.minimumBillableHours &&
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

      case "Per Kilometer":
        operatingCharge = (deur.odometerTripEvidence?.totalDistance ?? 0) * unitRate;
        break;
      case "Per Trip":
        operatingCharge = (deur.odometerTripEvidence?.tripCount ?? 0) * unitRate;
        break;
      case "Per Cubic Meter":
        operatingCharge = (deur.quantityEvidence?.quantity ?? 0) * unitRate;
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
      (isQuantityBilling ? 0 : standbyHours) *
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

      ...(terms.billingMethod === "Per Kilometer" ? {
        billingQuantity: deur.odometerTripEvidence?.totalDistance ?? 0,
        billingUnit: "KILOMETER" as const,
        unitRate,
      } : terms.billingMethod === "Per Trip" ? {
        billingQuantity: deur.odometerTripEvidence?.tripCount ?? 0,
        billingUnit: "TRIP" as const,
        unitRate,
      } : terms.billingMethod === "Per Cubic Meter" ? {
        billingQuantity: deur.quantityEvidence?.quantity ?? 0,
        billingUnit: "CUBIC_METER" as const,
        unitRate,
      } : {}),

      operatingHours,

      idleHours: standbyHours,

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
