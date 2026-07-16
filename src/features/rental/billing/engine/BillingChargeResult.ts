export interface BillingChargeResult {
  operatingHours: number;

  idleHours: number;

  mobilizationHours: number;

  demobilizationHours: number;

  operatingCharge: number;

  idleCharge: number;

  mobilizationCharge: number;

  demobilizationCharge: number;

  operatorCharge: number;

  fuelCharge: number;

  subtotal: number;

  vat: number;

  withholdingTax: number;

  grandTotal: number;
}