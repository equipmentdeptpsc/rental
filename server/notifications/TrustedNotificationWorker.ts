import { randomUUID } from "node:crypto";
import type { EmailDeliveryProvider } from "../../src/features/notifications/EmailDeliveryProvider";
import type { DeliveryStatus, NotificationIntent } from "../../src/features/notifications/domain";
import { renderNotificationTemplate } from "../../src/features/notifications/templates";
import { decideNotificationFailure } from "./NotificationRetryPolicy";

export interface ClaimedNotification extends NotificationIntent { attempt: number }
export interface TrustedNotificationWorkerRepository {
  claimBatch(workerId: string, limit: number): Promise<ClaimedNotification[]>;
  complete(input: {
    id: string; workerId: string; status: DeliveryStatus; providerName?: string;
    providerMessageId?: string; failureCategory?: string; retryAfterSeconds?: number;
  }): Promise<void>;
}

export class TrustedNotificationWorker {
  constructor(
    private readonly repository: TrustedNotificationWorkerRepository,
    private readonly provider: EmailDeliveryProvider,
    private readonly from: string,
    private readonly batchSize = 10,
  ) {}

  async runOnce(workerId = randomUUID()): Promise<{ claimed: number; providerCalls: number }> {
    const claimed = await this.repository.claimBatch(workerId, Math.max(1, Math.min(this.batchSize, 50)));
    let providerCalls = 0;
    for (const intent of claimed) {
      if (intent.requiresReviewCredential) {
        await this.repository.complete({ id: intent.id, workerId, status: "FailedCredentialLost", failureCategory: "Cancelled" });
        continue;
      }
      let email;
      try { email = renderNotificationTemplate(intent.type, intent.input); }
      catch {
        await this.repository.complete({ id: intent.id, workerId, status: "DeadLetter", failureCategory: "TemplateFailure" });
        continue;
      }
      providerCalls++;
      const result = await this.provider.send({
        from: this.from, to: intent.recipient.destination,
        recipientName: intent.recipient.displayName, email, idempotencyKey: intent.idempotencyKey,
      });
      if (result.accepted) {
        await this.repository.complete({
          id: intent.id, workerId, status: "ProviderAccepted",
          providerName: result.provider, providerMessageId: result.providerMessageId,
        });
      } else {
        const decision = decideNotificationFailure(
          result.category, false, intent.attempt, result.retryAfterSeconds,
        );
        await this.repository.complete({
          id: intent.id, workerId, status: decision.status,
          failureCategory: result.category, retryAfterSeconds: decision.delaySeconds,
        });
      }
    }
    return { claimed: claimed.length, providerCalls };
  }
}
