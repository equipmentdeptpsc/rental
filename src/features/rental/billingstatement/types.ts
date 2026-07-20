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
  deurRevisionChainId?: string;
  deurRevisionNumber?: number;
  effectiveDeurId?: string;
  correctedFromDeurId?: string;

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

}

export interface BillingStatement {

  // Identity

  id: string;

  statementNo: string;

  version: number;

  // References

  rentalId: string;

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

  // Lines

  lines: BillingStatementLine[];

  // Audit

  createdBy: string;

  createdAt: string;

}
