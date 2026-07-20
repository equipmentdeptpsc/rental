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
  "Per Month",
  "Per Trip",
  "Per Kilometer",
  "Per Cubic Meter",
  "One Lot",
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

export interface RentalCommercialSnapshot {
  billingMethod: RentalBillingMethod;
  unitRate: number;
  minimumBillableHours?: number;
  overtimeRate?: number;
  standbyRate?: number;
  mobilizationFee?: number;
  demobilizationFee?: number;
  fuelCharge?: number;
  operatorIncluded: boolean;
  operatorRate?: number;
  taxRate?: number;
  withholdingTax?: number;
  contractAmount?: number;
  currency: string;
  capturedAt: string;
}

export interface OperationalCodeSnapshot {
  id?: string;
  code: string;
  name: string;
}

export interface RentalOperationalMetadataSnapshot {
  costCode?: OperationalCodeSnapshot;
  activityCode?: OperationalCodeSnapshot;
}

export type DeurExpectationFrequency = "PER_WORKDAY" | "PER_SHIFT" | "ON_DEMAND";
export type DeurExpectationShiftCode = "DAY" | "NIGHT";
export type DeurExpectationSource = "EXPLICIT_POLICY" | "LEGACY_RENTAL_FALLBACK";
export type DeurShiftWindowCode = DeurExpectationShiftCode;
export type DeurShiftWindowSource = "IMMUTABLE_RENTAL_SNAPSHOT" | "LEGACY_LIVE_WINDOW_FALLBACK";
export interface DeurShiftWindowDefinition {
  code: DeurShiftWindowCode;
  label: string;
  startTime: string;
  endTime: string;
  timezone: string;
  capturedAt?: string;
}
export interface RentalDeurShiftWindowSnapshot extends DeurShiftWindowDefinition {
  capturedAt: string;
}
export interface RentalDeurExpectationPolicy {
  frequency: DeurExpectationFrequency;
  effectiveFrom: string;
  effectiveUntil?: string;
  expectedShiftCodes?: DeurExpectationShiftCode[];
  excludeDates?: string[];
  timezone?: string;
  capturedAt: string;
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
  commercialSnapshot?: RentalCommercialSnapshot;
  /** Distinguishes Part 11 records from legacy records that may use live terms. */
  commercialSnapshotRequired?: boolean;

  /** Immutable values captured from Equipment and Assignment at Rental creation. */
  operationalMetadata?: RentalOperationalMetadataSnapshot;

  /** Explicit monitoring policy, editable before release and immutable afterward. */
  deurExpectationPolicy?: RentalDeurExpectationPolicy;
  deurExpectationPolicyRequired?: boolean;
  deurExpectationPolicyFrozenAt?: string;
  /** Selected live windows copied atomically at Release; immutable thereafter. */
  deurShiftWindowSnapshots?: RentalDeurShiftWindowSnapshot[];

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
