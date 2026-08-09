export const MANAGER_REVIEW_REASON_MIN_LENGTH = 10;
export const MANAGER_REVIEW_REASON_MAX_LENGTH = 1000;

export type ManagerReviewAction = "APPROVE" | "REJECT" | "REQUEST_CORRECTION";
export type ManagerReviewStatus = "Pending" | "Approved" | "Rejected" | "CorrectionRequested";
export type ManagerReviewDisposition = "AVAILABLE" | "ACCEPTED" | "REPLAYED" | "ALREADY_COMPLETED";
export type ManagerReviewFailureCode =
  | "INVALID_OR_UNAVAILABLE"
  | "EXPIRED"
  | "SUPERSEDED"
  | "ALREADY_COMPLETED"
  | "IDEMPOTENCY_MISMATCH"
  | "VALIDATION_REJECTED"
  | "TRANSPORT_FAILURE";

export interface ManagerDeurReviewSnapshot {
  rentalReference: string;
  project: string;
  equipment: string;
  operator: string;
  workDate: string;
  shift?: string;
  submittedRevision: string;
  operationMinutes: number;
  idleMinutes: number;
  standbyMinutes: number;
  breakdownMinutes: number;
  openingMeter?: number;
  closingMeter?: number;
  correctionHistory: Array<{ revision: number; reasonCode?: string; reason?: string; correctedAt?: string }>;
  reviewHistory: Array<{ action: string; actor: string; occurredAt: string; reason?: string }>;
  billingEligible: boolean;
  reviewStatus: ManagerReviewStatus;
  availableActions: ManagerReviewAction[];
  expiresAt?: string;
  timeline?: import("../customer-review/publicReviewContracts").PublicReviewTimelineEntry[];
  customerDecision?: { action: string; occurredAt: string; reason?: string };
}

export type ManagerReviewResult<T> =
  | { success: true; disposition: ManagerReviewDisposition; value: T }
  | { success: false; code: ManagerReviewFailureCode };

export interface ManagerReviewRepository {
  getSnapshot(credential: string): Promise<ManagerReviewResult<ManagerDeurReviewSnapshot>>;
  approve(credential: string, command: ManagerReviewCommand): Promise<ManagerReviewResult<ManagerReviewDecision>>;
  reject(credential: string, command: ManagerReviewReasonCommand): Promise<ManagerReviewResult<ManagerReviewDecision>>;
  requestCorrection(credential: string, command: ManagerReviewReasonCommand): Promise<ManagerReviewResult<ManagerReviewDecision>>;
}

export interface ManagerReviewCommand {
  commandId: string;
  idempotencyKey: string;
}

export interface ManagerReviewReasonCommand extends ManagerReviewCommand {
  reason: string;
}

export interface ManagerReviewDecision {
  reviewStatus: Exclude<ManagerReviewStatus, "Pending">;
  eventType: "MANAGER_DEUR_APPROVED" | "MANAGER_DEUR_REJECTED" | "MANAGER_DEUR_CORRECTION_REQUESTED";
}

export interface ManagerReviewNotification {
  eventType: "MANAGER_DEUR_REVIEW_ISSUED";
  recipientDestination: string;
  managerDisplayName: string;
  rentalReference: string;
  reviewUrl: string;
  expiresAt: string;
}

export function createManagerReviewNotification(
  input: Omit<ManagerReviewNotification, "reviewUrl"> & { reviewPath: string },
  publicOrigin: string,
): ManagerReviewNotification {
  return { ...input, reviewUrl: new URL(input.reviewPath, publicOrigin).toString() };
}
