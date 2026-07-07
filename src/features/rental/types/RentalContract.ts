export type RentalType =
  | "Bare Rental"
  | "Operated Rental";

export type BillingMethod =
  | "Per Hour"
  | "Per Day"
  | "Per Week"
  | "Per Month"
  | "Per Cubic Meter"
  | "One Lot";

export interface RentalContractRecord {
  id: string;

  contractNo: string;

  customerId: string;

  equipmentId: string;

  projectId: string;

  rentalType: RentalType;

  billingMethod: BillingMethod;

  currency: string;

  unitRate: number;

  minimumBillableHours?: number;

  overtimeRate?: number;

  standbyRate?: number;

  mobilizationFee?: number;

  demobilizationFee?: number;

  fuelCharge?: number;

  operatorIncluded: boolean;

  operatorRate?: number;

  // NEW
  contractAmount?: number;

  // NEW
  estimatedVolume?: number;

  // NEW
  billingDay?: number;

  // NEW
  taxRate?: number;

  // NEW
  withholdingTax?: number;

  // NEW
  remarks?: string;

  startDate: string;

  expectedEndDate: string;

  status:
    | "Draft"
    | "Active"
    | "Completed"
    | "Cancelled";

  createdAt: string;

  updatedAt: string;
}