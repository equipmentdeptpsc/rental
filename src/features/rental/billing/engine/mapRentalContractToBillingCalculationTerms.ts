import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import type { BillingCalculationTerms } from "./BillingCalculationTerms";

/** Pure compatibility adapter for the current Contract-driven billing flow. */
export function mapRentalContractToBillingCalculationTerms(
  contract: RentalContractRecord,
): BillingCalculationTerms {
  return {
    billingMethod: contract.billingMethod,
    unitRate: contract.unitRate,
    minimumBillableHours: contract.minimumBillableHours,
    overtimeRate: contract.overtimeRate,
    standbyRate: contract.standbyRate,
    mobilizationFee: contract.mobilizationFee,
    demobilizationFee: contract.demobilizationFee,
    fuelCharge: contract.fuelCharge,
    operatorIncluded: contract.operatorIncluded,
    operatorRate: contract.operatorRate,
    taxRate: contract.taxRate,
    withholdingTax: contract.withholdingTax,
    contractAmount: contract.contractAmount,
  };
}
