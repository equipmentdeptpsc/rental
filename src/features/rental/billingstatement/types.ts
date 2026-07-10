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

  deurId: string;

  workDate: string;

  description: string;

  costCode: string;

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