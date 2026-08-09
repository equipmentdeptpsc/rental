export type NotificationType =
  | "CUSTOMER_REVIEW_REQUESTED" | "CUSTOMER_CORRECTED_REVIEW_REQUESTED"
  | "CUSTOMER_ACKNOWLEDGED" | "CUSTOMER_CORRECTION_CONFIRMED"
  | "MANAGER_REVIEW_REQUESTED" | "MANAGER_CORRECTED_REVIEW_REQUESTED"
  | "MANAGER_APPROVED" | "MANAGER_REJECTED" | "MANAGER_CORRECTION_CONFIRMED"
  | "CUSTOMER_CORRECTION_WORK_ITEM" | "MANAGER_CORRECTION_WORK_ITEM";

export type DeliveryStatus =
  | "Pending" | "Processing" | "ProviderAccepted" | "Failed" | "Cancelled" | "Superseded"
  | "UnknownOutcome" | "FailedCredentialLost" | "DeadLetter";
export type DeliveryFailureCategory =
  | "TemporaryProviderFailure" | "RateLimited" | "Timeout" | "InvalidRecipient"
  | "AuthenticationFailure" | "TemplateFailure" | "PermanentProviderRejection"
  | "Superseded" | "Cancelled" | "UnknownProviderFailure" | "UnknownOutcome";

export interface NotificationRecipient {
  destination: string;
  displayName: string;
}

export interface NotificationTemplateInput {
  recipientName: string;
  companyName: string;
  rentalReference: string;
  projectName?: string;
  equipmentDescription?: string;
  workDate?: string;
  deurNumber?: string;
  revisionLabel?: string;
  expirationLabel?: string;
  reason?: string;
  reviewUrl?: string;
  activityTimeline?: readonly {
    sequence: number;
    activityType: string;
    start: string;
    end: string;
    durationSeconds: number;
    workDescription?: string;
    remarks?: string;
    openingMeter?: number;
    closingMeter?: number;
  }[];
  activityTotals?: { operationMinutes: number; idleMinutes: number; standbyMinutes: number; breakdownMinutes: number };
}

export interface NotificationIntent {
  id: string;
  companyId: string;
  type: NotificationType;
  recipient: NotificationRecipient;
  sourceAggregateType: string;
  sourceAggregateId: string;
  reviewRequestId?: string;
  deurRevisionReference?: string;
  templateVersion: number;
  idempotencyKey: string;
  input: NotificationTemplateInput;
  requiresReviewCredential?: boolean;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}
