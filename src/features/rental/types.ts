export type RentalLifecycleStatus =
  | "Draft"
  | "Assigned"
  | "Reserved"
  | "Released"
  | "Active"
  | "Returned"
  | "Closed"
  | "Cancelled";

export type RentalApprovalStatus = "NotSubmitted" | "Pending" | "Approved" | "Rejected";

export interface RentalApprovalActor {
  id: string;
  name: string;
  role: "Admin" | "Manager" | "Operator";
}

export interface RentalApprovalEvent {
  id: string;
  action: "Submitted" | "Resubmitted" | "Approved" | "Rejected" | "Invalidated";
  timestamp: string;
  actor?: RentalApprovalActor;
  previousStatus: RentalApprovalStatus;
  resultingStatus: RentalApprovalStatus;
  remarks?: string;
}

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
  meterEvidenceRequirement?: "none" | "odometer" | "hourMeter" | "both";
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
  meterEvidenceRequirement?: "none" | "odometer" | "hourMeter" | "both";
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
  /** Canonical remote preparation staged while the Rental remains Draft. */
  draftPreparation?: {
    costCodeId?: string;
    activityCodeId?: string;
    workDescriptionId?: string;
    operationalRemarks?: string;
    meterRequirement?: "none" | "odometer" | "hourMeter" | "both";
    deurPolicy?: RentalDeurExpectationPolicy;
  };
}

export interface RentalLineDeurExpectationSnapshot {
  rentalEquipmentLineId: string;
  rentalId: string;
  equipmentId: string;
  assignmentId: string;
  operatorId: string;
  projectId: string;
  customerId?: string;
  policy: RentalDeurExpectationPolicy;
  shiftWindows: RentalDeurShiftWindowSnapshot[];
  workDescription: { id?: string; code?: string; name: string; requiresRemarks: boolean };
  operationalRemarks?: string;
  workDateRule: "RENTAL_DATE_OUT";
  workDate: string;
  meterRequirement: "none" | "odometer" | "hourMeter" | "both";
  fuelEvidenceRequired: boolean;
  billingMethod: RentalBillingMethod;
  operationalMetadata: RentalOperationalMetadataSnapshot;
  sourceFingerprint: string;
  capturedAt: string;
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

/** Read compatibility for the retired duplicate label; new values are always canonical. */
export function normalizeRentalBillingMethod(value: unknown): RentalBillingMethod | undefined {
  if (value === "Per Lot") return "One Lot";
  return isRentalBillingMethod(value) ? value : undefined;
}

export interface RentalRecord {
  id: string;

  /** Optional for compatibility with records created before lifecycle numbering. */
  rentalNumber?: string;

  equipmentId: string;

  customerId?: string;
  customerContactSnapshot?:{representativeName:string;representativeEmail:string;designation?:string;contactNumber?:string;capturedAt:string;updatedAt?:string;updatedBy?:string};

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

  approvalStatus?: RentalApprovalStatus;
  approvalRequestedAt?: string;
  approvalRequestedBy?: RentalApprovalActor;
  approvalApprovedAt?: string;
  approvalApprovedBy?: RentalApprovalActor;
  approvalRejectedAt?: string;
  approvalRejectedBy?: RentalApprovalActor;
  approvalDecisionRemarks?: string;
  approvalHistory?: RentalApprovalEvent[];

  remarks?: string;

  statusId: string;

  status: RentalLifecycleStatus;

  /** Canonical remote optimistic-concurrency token. */
  rowVersion?: number;
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
