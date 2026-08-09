export interface BillingChargeResult {
  billingQuantity?: number;
  billingUnit?: "KILOMETER" | "TRIP" | "CUBIC_METER";
  unitRate?: number;
  operatingHours: number;

  idleHours: number;

  standbyHours?: number;

  mobilizationHours: number;

  demobilizationHours: number;

  operatingCharge: number;

  idleCharge: number;

  standbyCharge?: number;

  mobilizationCharge: number;

  demobilizationCharge: number;

  operatorCharge: number;

  fuelCharge: number;

  subtotal: number;

  vat: number;

  withholdingTax: number;

  grandTotal: number;
}
