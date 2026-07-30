import type { DeliveryFailureCategory, RenderedEmail } from "./domain";

export interface EmailDeliveryRequest {
  from: string;
  to: string;
  recipientName: string;
  email: RenderedEmail;
  idempotencyKey: string;
}

export type EmailDeliveryResult =
  | { accepted: true; provider: string; providerMessageId: string }
  | { accepted: false; provider: string; category: DeliveryFailureCategory; retryAfterSeconds?: number };

export interface EmailDeliveryProvider {
  readonly name: string;
  send(request: EmailDeliveryRequest, signal?: AbortSignal): Promise<EmailDeliveryResult>;
}
