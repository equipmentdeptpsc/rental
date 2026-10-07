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
    if (terms.discountType === "PERCENTAGE" && ((terms.discountValue ?? 0) < 0 || (terms.discountValue ?? 0) > 100)) {
      throw new RangeError("Percentage discount must be between 0 and 100.");
    }
    const money = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

    const isQuantityBilling = terms.billingMethod === "Per Kilometer" || terms.billingMethod === "Per Trip" || terms.billingMethod === "Per Cubic Meter";
    let operatingHours = isQuantityBilling ? 0 : deur.totalOperatingMinutes / 60;

    const idleHours = isQuantityBilling ? 0 : deur.totalIdleMinutes / 60;
    const standbyHours = isQuantityBilling ? 0 : (deur.totalStandbyMinutes ?? deur.totals?.standbyMinutes ?? 0) / 60;

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
    const idleCharge = idleHours * (terms.idleRate ?? 0);
    const standbyCharge = standbyHours * (terms.standbyRate ?? 0);

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
      standbyCharge +
      mobilizationCharge +
      demobilizationCharge +
      operatorCharge +
      fuelCharge;

    //
    // VAT
    //
    const discountAmount = terms.discountType === "PERCENTAGE"
      ? money(subtotal * (terms.discountValue ?? 0) / 100)
      : terms.discountType === "FIXED_AMOUNT" ? Math.min(subtotal, terms.discountValue ?? 0) : 0;
    const subtotalAfterDiscount = subtotal - discountAmount;
    const vat = terms.vatApplicability === "Not Applicable" ? 0
      : money(subtotalAfterDiscount * ((terms.taxRate ?? 0) / 100));

    //
    // Withholding Tax
    //
    const withholdingTax = money(subtotalAfterDiscount * ((terms.withholdingTax ?? 0) / 100));

    //
    // Grand Total
    //
    const grandTotal =
      subtotalAfterDiscount +
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

      idleHours,

      standbyHours,

      mobilizationHours,

      demobilizationHours,

      operatingCharge,

      idleCharge,

      standbyCharge,

      mobilizationCharge,

      demobilizationCharge,

      operatorCharge,

      fuelCharge,

      subtotal,
      discountAmount,
      subtotalAfterDiscount,

      vat,

      withholdingTax,

      grandTotal,

    };

  }
}
