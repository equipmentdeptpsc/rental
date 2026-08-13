import type { PublicReviewTimelineEntry } from "./publicReviewContracts";

export type PublicGroupedReviewState =
  | "SUBMITTED_AWAITING_ACKNOWLEDGEMENT"
  | "IN_PROGRESS"
  | "ACKNOWLEDGED"
  | "CORRECTION_REQUESTED";

export type PublicGroupedReviewAction = "ACKNOWLEDGE" | "REQUEST_CORRECTION";
export type PublicGroupedBatchStatus = "OPEN" | "PARTIALLY_REVIEWED" | "COMPLETED";
export type PublicGroupedDisposition = "AVAILABLE" | "COMPLETED" | "ACCEPTED" | "REPLAYED" | "ALREADY_COMPLETED";
export type PublicGroupedFailureCode =
  | "INVALID_OR_UNAVAILABLE"
  | "EXPIRED"
  | "SUPERSEDED"
  | "NOT_ACTIONABLE"
  | "ALREADY_COMPLETED"
  | "IDEMPOTENCY_MISMATCH"
  | "VALIDATION_REJECTED"
  | "TRANSPORT_FAILURE";

export interface PublicCustomerReviewBatchItem {
  publicItemId: string;
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
  timeline: PublicReviewTimelineEntry[];
  reviewState: PublicGroupedReviewState;
  availableActions: PublicGroupedReviewAction[];
}

export interface PublicCustomerReviewBatch {
  company: string;
  customer: string;
  project: string;
  rental: string;
  reviewDate: string;
  businessTimezone: string;
  displayDate: string;
  totalLineCount: number;
  actionableCount: number;
  inProgressCount: number;
  acknowledgedCount: number;
  correctionRequestedCount: number;
  batchStatus: PublicGroupedBatchStatus;
  items: PublicCustomerReviewBatchItem[];
}

export type PublicGroupedReviewResult<T> =
  | { success: true; disposition: PublicGroupedDisposition; value: T }
  | { success: false; code: PublicGroupedFailureCode };

export interface PublicCustomerReviewBatchRepository {
  lookup(credential: string): Promise<PublicGroupedReviewResult<PublicCustomerReviewBatch>>;
  acknowledgeItem(
    credential: string,
    publicItemId: string,
    command: { commandId: string; idempotencyKey: string },
  ): Promise<PublicGroupedReviewResult<PublicCustomerReviewBatch>>;
  requestCorrection(
    credential: string,
    publicItemId: string,
    remarks: string,
    command: { commandId: string; idempotencyKey: string },
  ): Promise<PublicGroupedReviewResult<PublicCustomerReviewBatch>>;
}
