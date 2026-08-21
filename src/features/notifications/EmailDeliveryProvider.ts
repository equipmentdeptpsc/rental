import type { DeliveryFailureCategory, RenderedEmail } from "./domain";

export interface EmailDeliveryRequest {
  from: string;
  to: string;
  recipientName: string;
  email: RenderedEmail;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; contentType: "application/pdf"; contentBase64: string }>;
}

export interface ProviderSafeDiagnostic {
  deliveryOutcome: "KNOWN_PRE_SEND_FAILURE" | "KNOWN_PROVIDER_RESPONSE" | "UNKNOWN_DELIVERY_OUTCOME";
  retryable: boolean;
  exceptionName?: string;
  httpStatus?: number;
}

export type EmailDeliveryResult =
  | { accepted: true; provider: string; providerMessageId: string }
  | { accepted: false; provider: string; category: DeliveryFailureCategory; retryAfterSeconds?: number;
      diagnostic?: ProviderSafeDiagnostic };

export interface EmailDeliveryProvider {
  readonly name: string;
  send(request: EmailDeliveryRequest, signal?: AbortSignal): Promise<EmailDeliveryResult>;
}
