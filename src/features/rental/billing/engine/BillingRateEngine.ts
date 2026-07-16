import type {
  DeurRecord,
} from "@/features/rental/deur";

import type {
  RentalContractRecord,
} from "@/features/rental/types/RentalContract";

import type {
  BillingChargeResult,
} from "./BillingChargeResult";

export class BillingRateEngine {
  static calculate(
    deur: DeurRecord,
    contract: RentalContractRecord
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
      contract.minimumBillableHours &&
      operatingHours <
        contract.minimumBillableHours
    ) {
      operatingHours =
        contract.minimumBillableHours;
    }

    const unitRate =
      contract.unitRate;

    //
    // Operating Charge
    //
    let operatingCharge = 0;

    switch (contract.billingMethod) {

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
          contract.contractAmount ??
          unitRate;
        break;
    }

    //
    // Idle Charge
    //
    const idleCharge =
      idleHours *
      (contract.standbyRate ?? 0);

    //
    // Mobilization
    //
    const mobilizationCharge =
      contract.mobilizationFee ?? 0;

    //
    // Demobilization
    //
    const demobilizationCharge =
      contract.demobilizationFee ?? 0;

    //
    // Operator
    //
    const operatorCharge =
      contract.operatorIncluded
        ? 0
        : (contract.operatorRate ?? 0);

    //
    // Fuel
    //
    const fuelCharge =
      contract.fuelCharge ?? 0;

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
      ((contract.taxRate ?? 0) / 100);

    //
    // Withholding Tax
    //
    const withholdingTax =
      subtotal *
      ((contract.withholdingTax ?? 0) / 100);

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