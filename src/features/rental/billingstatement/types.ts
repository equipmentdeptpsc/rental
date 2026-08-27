export type BillingApprovalStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected";

export type BillingInvoiceStatus =
  | "Not Invoiced"
  | "Invoiced"
  | "Partially Collected"
  | "Fully Collected"
  | "Cancelled";

export interface BillingStatementLine {

  /** Stable identity for newly calculated canonical statement lines. */
  id?: string;

  deurId: string;
  rentalEquipmentLineId?: string;
  equipmentId?: string;
  operatorId?: string;
  shift?: "Day" | "Night";
  deurRevisionChainId?: string;
  deurRevisionNumber?: number;
  effectiveDeurId?: string;
  correctedFromDeurId?: string;
  deurReference?: string;
  equipmentLabel?: string;
  operatorLabel?: string;
  commercialSnapshotId?: string;
  commercialSnapshotHash?: string;
  rentalNumberSnapshot?: string;
  rentalEquipmentLineSnapshot?: { id: string; rentalId: string; equipmentId: string; assignmentId?: string; operatorId?: string };
  equipmentSnapshot?: { id: string; assetNo?: string; name?: string };
  assignmentSnapshot?: { id: string; equipmentId: string; operatorId: string; projectId?: string };
  operatorSnapshot?: { id: string; name?: string };

  workDate: string;

  description: string;

  costCode: string;

  activityCode?: string;

  quantity?: number;

  unit?: "km" | "trip" | "m³";

  unitRate?: number;

  billingMethod?: string;
  commercialTermsSource?: "IMMUTABLE_SNAPSHOT" | "LEGACY_RENTAL_FALLBACK";
  commercialCapturedAt?: string;

  hours: number;

  hourlyRate: number;

  amount: number;

  operatingCharge?: number;
  idleCharge?: number;
  idleHours?: number;
  standbyCharge?: number;
  standbyHours?: number;
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  operatorCharge?: number;
  fuelCharge?: number;
  vat?: number;
  withholdingTax?: number;
  grandTotal?: number;

}

export interface BillingStatement {

  // Identity

  id: string;

  statementNo: string;

  version: number;

  // References

  rentalId: string;
  rentalNumber?: string;
  customerRepresentativeName?: string;
  customerRepresentativeEmail?: string;

  equipmentId: string;

  operatorId: string;

  customer: string;

  project: string;

  // Billing Period

  billingFrom: string;

  billingTo: string;

  subtotal: number;

  /** Engine-derived financial totals added by explicit DEUR handoffs. */
  vat?: number;
  withholdingTax?: number;
  grandTotal?: number;
  /** Frozen tax-visibility evidence. Legacy statements fall back to field presence. */
  vatApplicable?: boolean;
  withholdingTaxApplicable?: boolean;

  // Approval Workflow

  approvalStatus: BillingApprovalStatus;

  submittedBy?: string;

  submittedAt?: string;

  approvedBy?: string;

  approvedAt?: string;

  rejectedBy?: string;

  rejectedAt?: string;

  rejectionRemarks?: string;

  // Financial Workflow

  invoiceStatus: BillingInvoiceStatus;
  /** Optional transition evidence for records invoiced after RC1; legacy records fall back to createdAt. */
  invoiceStatusUpdatedAt?: string;
  invoiceStatusUpdatedBy?: string;
  invoiceNumber?: string;

  // Lines

  lines: BillingStatementLine[];

  // Audit

  createdBy: string;

  createdAt: string;

}
