import type { DeliveryFailureCategory, DeliveryStatus } from "../../src/features/notifications/domain";

export interface RetryDecision {
  status: DeliveryStatus;
  retryable: boolean;
  delaySeconds?: number;
}

export function decideNotificationFailure(
  category: DeliveryFailureCategory,
  requiresReviewCredential: boolean,
  attempt: number,
  retryAfterSeconds?: number,
): RetryDecision {
  if (["UnknownOutcome", "NetworkException", "ProviderParseError", "ProviderUnknownError"].includes(category)
    || (category === "Timeout" && requiresReviewCredential)) {
    return { status: "UnknownOutcome", retryable: false };
  }
  if (requiresReviewCredential) return { status: "FailedCredentialLost", retryable: false };
  if (["InvalidRecipient", "AuthenticationFailure", "TemplateFailure", "PermanentProviderRejection"].includes(category)) {
    return { status: "DeadLetter", retryable: false };
  }
  if (attempt >= 5) return { status: "DeadLetter", retryable: false };
  return {
    status: "Failed", retryable: true,
    delaySeconds: category === "RateLimited" ? Math.max(1, retryAfterSeconds ?? 60) : Math.min(300, 2 ** attempt),
  };
}
