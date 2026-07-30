export const CUSTOMER_CORRECTION_REASON_MIN_LENGTH = 10;
export const CUSTOMER_CORRECTION_REASON_MAX_LENGTH = 1000;

export type PublicReviewAction = "ACKNOWLEDGE" | "REQUEST_CORRECTION";
export type PublicReviewDisposition = "AVAILABLE" | "ACCEPTED" | "REPLAYED" | "ALREADY_COMPLETED";
export type PublicReviewFailureCode =
  | "INVALID_OR_UNAVAILABLE"
  | "EXPIRED"
  | "SUPERSEDED"
  | "ALREADY_COMPLETED"
  | "IDEMPOTENCY_MISMATCH"
  | "VALIDATION_REJECTED"
  | "TRANSPORT_FAILURE";

export interface PublicReviewTimelineEntry {
  activity: string;
  action: "start" | "end";
  occurredAt: string;
  sequence: number;
}

export interface PublicDeurReviewSnapshot {
  rentalReference: string;
  customerName: string;
  project: string;
  equipment: string;
  operator: string;
  workDate: string;
  shift?: string;
  shiftStart?: string;
  shiftEnd?: string;
  operationMinutes: number;
  idleMinutes: number;
  standbyMinutes: number;
  breakdownMinutes: number;
  openingMeter?: number;
  closingMeter?: number;
  submittedRevision: string;
  submittedAt?: string;
  timeline: PublicReviewTimelineEntry[];
  reviewStatus: "Pending" | "Acknowledged" | "CorrectionRequested";
  availableActions: PublicReviewAction[];
  expiresAt?: string;
}

export type PublicReviewResult<T> =
  | { success: true; disposition: PublicReviewDisposition; value: T }
  | { success: false; code: PublicReviewFailureCode };

export interface PublicCustomerReviewRepository {
  getSnapshot(credential: string): Promise<PublicReviewResult<PublicDeurReviewSnapshot>>;
  acknowledge(
    credential: string,
    command: { commandId: string; idempotencyKey: string },
  ): Promise<PublicReviewResult<{ reviewStatus: "Acknowledged" }>>;
  requestCorrection(
    credential: string,
    command: { commandId: string; idempotencyKey: string; reason: string },
  ): Promise<PublicReviewResult<{ reviewStatus: "CorrectionRequested" }>>;
}

export interface CustomerReviewNotification {
  eventType: "CUSTOMER_DEUR_REVIEW_REQUESTED";
  recipientDestination: string;
  customerDisplayName: string;
  rentalReference: string;
  equipmentSummary: string;
  reviewUrl: string;
  expiresAt: string;
}

export function createCustomerReviewNotification(
  input: Omit<CustomerReviewNotification, "reviewUrl"> & { reviewPath: string },
  publicOrigin: string,
): CustomerReviewNotification {
  return {
    eventType: input.eventType,
    recipientDestination: input.recipientDestination,
    customerDisplayName: input.customerDisplayName,
    rentalReference: input.rentalReference,
    equipmentSummary: input.equipmentSummary,
    reviewUrl: new URL(input.reviewPath, publicOrigin).toString(),
    expiresAt: input.expiresAt,
  };
}
