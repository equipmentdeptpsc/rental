import type { PublicReviewTimelineEntry } from "./publicReviewContracts";

export interface CustomerReviewBatchKey {
  companyId: string;
  customerId: string;
  projectId: string;
  rentalId: string;
  reviewDate: string;
}

export type CustomerReviewBatchItemState =
  | "IN_PROGRESS"
  | "SUBMITTED_AWAITING_ACKNOWLEDGEMENT"
  | "ACKNOWLEDGED"
  | "CORRECTION_REQUESTED"
  | "CORRECTED_REVISION_PENDING";

export type CustomerReviewBatchStatus =
  | "OPEN"
  | "PARTIALLY_REVIEWED"
  | "COMPLETED"
  | "EXPIRED"
  | "SUPERSEDED";

export interface CustomerReviewBatchItemSnapshot {
  equipmentName: string;
  assetNumber: string;
  operator?: string;
  deurNumber?: string;
  revisionLabel?: string;
  workDate?: string;
  shift?: string;
  shiftStart?: string;
  shiftEnd?: string;
  operationMinutes?: number;
  idleMinutes?: number;
  standbyMinutes?: number;
  breakdownMinutes?: number;
  openingMeter?: number;
  closingMeter?: number;
  timeline?: readonly PublicReviewTimelineEntry[];
  reviewState: CustomerReviewBatchItemState;
}

export interface CustomerReviewBatchItem {
  id: string;
  batchId: string;
  rentalEquipmentLineId: string;
  equipmentId: string;
  operatorId?: string;
  deurId?: string;
  revisionId?: string;
  customerReviewRequestId?: string;
  snapshot: CustomerReviewBatchItemSnapshot;
  createdAt: string;
}

export interface CustomerReviewBatch {
  id: string;
  key: CustomerReviewBatchKey;
  businessTimezone: string;
  expiresAt: string;
  createdAt: string;
  supersededAt?: string;
  supersededByBatchId?: string;
  summarySnapshot: Readonly<Record<string, unknown>>;
  version: number;
}

export interface GenerateCustomerReviewBatchInput {
  commandId: string;
  idempotencyKey: string;
  rentalId: string;
  businessDate?: string;
}

export interface GeneratedCustomerReviewBatchValue {
  batchId: string;
  reviewDate: string;
  expiresAt: string;
  totalLineCount?: number;
  actionableCount?: number;
  inProgressCount?: number;
  acknowledgedCount?: number;
  correctionRequestedCount?: number;
  /** Present only for the initial trusted creation result; never persisted. */
  credential?: string;
}

export type GenerateCustomerReviewBatchResult =
  | { success: true; disposition: "CREATED" | "EXISTING" | "REPLAYED"; value: GeneratedCustomerReviewBatchValue }
  | { success: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION_REJECTED" | "NOT_FOUND" |
      "INVALID_TIMEZONE" | "INVALID_BUSINESS_DATE" | "INVALID_TRANSITION" | "IDEMPOTENCY_MISMATCH" | "TRANSPORT_FAILURE" };

export interface CustomerReviewBatchGenerationRepository {
  generate(input: GenerateCustomerReviewBatchInput): Promise<GenerateCustomerReviewBatchResult>;
}

export interface CustomerReviewBatchRepository {
  findByGroupDate(key: CustomerReviewBatchKey): Promise<CustomerReviewBatch | undefined>;
  getBatch(id: string): Promise<CustomerReviewBatch | undefined>;
  listItems(batchId: string): Promise<readonly CustomerReviewBatchItem[]>;
}
