export type BillingCalculationMethod =
  | "Per Hour"
  | "Per Day"
  | "Per Week"
  | "Per Month"
  | "Per Cubic Meter"
  | "One Lot";

/**
 * The commercial values consumed by the billing calculator. This deliberately
 * excludes Rental Contract document identity and lifecycle metadata.
 */
export interface BillingCalculationTerms {
  readonly billingMethod: BillingCalculationMethod;
  readonly unitRate: number;
  readonly minimumBillableHours?: number;
  readonly overtimeRate?: number;
  readonly standbyRate?: number;
  readonly mobilizationFee?: number;
  readonly demobilizationFee?: number;
  readonly fuelCharge?: number;
  readonly operatorIncluded: boolean;
  readonly operatorRate?: number;
  readonly taxRate?: number;
  readonly withholdingTax?: number;
  readonly contractAmount?: number;
}
