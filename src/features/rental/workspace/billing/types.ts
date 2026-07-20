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
  deurRevisionChainId?: string;
  deurRevisionNumber?: number;
  effectiveDeurId?: string;
  correctedFromDeurId?: string;

  deurReference?: string;

  workDate: string;

  operator: string;

  operatingHours: number;

  actualHours: number;

  billingMethod: string;

  costCode: string;

  activityCode?: string;

  quantity?: number;

  unit?: "km" | "trip" | "m³";

  unitRate?: number;
  commercialTermsSource?: "IMMUTABLE_SNAPSHOT" | "LEGACY_RENTAL_FALLBACK";
  commercialCapturedAt?: string;

  description: string;

  hourlyRate: number;

  amount: number;
}
