export type RentalLifecycleStatus =
  | "Draft"
  | "Assigned"
  | "Reserved"
  | "Released"
  | "Active"
  | "Returned"
  | "Closed"
  | "Cancelled";

export const rentalTypes = ["Bare Rental", "Operated Rental"] as const;
export type RentalType = typeof rentalTypes[number];

export const rentalBillingMethods = [
  "Per Hour",
  "Per Day",
  "Per Week",
  "Per Trip",
  "Per Kilometer",
  "Per Cubic Meter",
  "Per Lot",
] as const;
export type RentalBillingMethod = typeof rentalBillingMethods[number];

export type VatApplicability = "Applicable" | "Not Applicable";
export type TransactionRelationship = "Affiliate" | "Non-Affiliate";

/** Serializable rental-level commercial inputs. Rental type and method remain on RentalRecord. */
export interface RentalBillingTerms {
  unitRate?: number;
  minimumBillableHours?: number;
  overtimeRate?: number;
  standbyRate?: number;
  mobilizationFee?: number;
  demobilizationFee?: number;
  fuelCharge?: number;
  operatorRate?: number;
  vatApplicability?: VatApplicability;
  withholdingTax?: number;
}

export function isRentalType(value: unknown): value is RentalType {
  return typeof value === "string" && rentalTypes.includes(value as RentalType);
}

export function isRentalBillingMethod(value: unknown): value is RentalBillingMethod {
  return typeof value === "string" && rentalBillingMethods.includes(value as RentalBillingMethod);
}

export interface RentalRecord {
  id: string;

  /** Optional for compatibility with records created before lifecycle numbering. */
  rentalNumber?: string;

  equipmentId: string;

  customerId?: string;

  projectId?: string;

  operatorId?: string;

  assignmentId?: string;

  customer: string;

  project: string;

  rentedBy: string;

  dateOut: string;

  /** Optional for long-term rentals without a planned return date. */
  expectedReturn?: string;

  actualReturn?: string;

  /** Optional for historical records created before commercial terms were captured. */
  rentalType?: RentalType;
  billingMethod?: RentalBillingMethod;
  transactionRelationship?: TransactionRelationship;
  billingTerms?: RentalBillingTerms;

  /** Actual transaction timestamps used by the rental workspace timeline. */
  createdAt?: string;
  reservedAt?: string;
  releasedAt?: string;
  activatedAt?: string;
  returnedAt?: string;
  closedAt?: string;
  cancelledAt?: string;

  remarks?: string;

  statusId: string;

  status: RentalLifecycleStatus;
}

export function isOverdue(
  rental: RentalRecord
) {
  if (!rental.expectedReturn ||
    rental.status === "Returned" ||
    rental.status === "Closed"
  ) {
    return false;
  }

  return (
    new Date(
      rental.expectedReturn
    ) < new Date()
  );
}
