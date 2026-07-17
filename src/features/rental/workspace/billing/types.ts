export interface BillingSummary {
  operatingCharge: number;

  idleCharge: number;

  mobilizationCharge: number;

  demobilizationCharge: number;

  adjustment: number;

  subtotal: number;

  invoiced: number;

  collected: number;

  outstanding: number;
}

export interface BillingPreviewLine {
  deurId: string;

  deurReference?: string;

  workDate: string;

  operator: string;

  operatingHours: number;

  actualHours: number;

  billingMethod: string;

  costCode: string;

  description: string;

  hourlyRate: number;

  amount: number;
}
