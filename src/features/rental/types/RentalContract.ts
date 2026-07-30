export type RentalType =
  | "Bare Rental"
  | "Operated Rental";

export type BillingMethod =
  | "Per Hour"
  | "Per Day"
  | "Per Week"
  | "Per Month"
  | "Per Kilometer"
  | "Per Trip"
  | "Per Cubic Meter"
  | "One Lot";

export interface RentalContractRecord {
  id: string;

  /** Added for line-level compatibility; legacy records continue to use id === rentalId. */
  rentalId?: string;

  /** Stable Rental Equipment Line association for new reads. */
  rentalEquipmentLineId?: string;

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

  meterEvidenceRequirement?: "none" | "odometer" | "hourMeter" | "both";

  transactionRelationship?: import("../types").TransactionRelationship;

  vatApplicability?: import("../types").VatApplicability;

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
