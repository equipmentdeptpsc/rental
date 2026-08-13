import { randomUUID } from "node:crypto";
import type { EmailDeliveryProvider } from "../../src/features/notifications/EmailDeliveryProvider";
import type { NotificationIntent } from "../../src/features/notifications/domain";
import { renderNotificationTemplate } from "../../src/features/notifications/templates";
import { decideNotificationFailure } from "./NotificationRetryPolicy";
import type { TrustedNotificationWorkerRepository } from "./TrustedNotificationWorker";

export interface TrustedReviewIssuanceResult {
  success: boolean;
  disposition?: string;
  reviewPath?: string;
  notificationIntentId?: string;
  [key: string]: unknown;
}

export interface TrustedReviewIssuanceRepository extends TrustedNotificationWorkerRepository {
  issue(kind: "customer" | "manager" | "grouped-customer", command: Record<string, unknown>): Promise<TrustedReviewIssuanceResult>;
  getIntent(id: string): Promise<NotificationIntent & { attempt: number }>;
  claim(id: string, workerId: string): Promise<boolean>;
}

export class TrustedReviewIssuanceOrchestrator {
  constructor(
    private readonly repository: TrustedReviewIssuanceRepository,
    private readonly provider: EmailDeliveryProvider,
    private readonly from: string,
    private readonly publicBaseUrl: string,
  ) {}

  async issue(kind: "customer" | "manager" | "grouped-customer", command: Record<string, unknown>): Promise<TrustedReviewIssuanceResult> {
    const result = await this.repository.issue(kind, command);
    if (!result.success || result.disposition === "REPLAYED") return result;
    const intentId = typeof result.notificationIntentId === "string" ? result.notificationIntentId : "";
    const persistedPath = kind === "grouped-customer" && intentId ? await this.repository.getGroupedReviewPath?.(intentId) : undefined;
    const path = persistedPath ?? (typeof result.reviewPath === "string" ? result.reviewPath : "");
    const expectedPath = kind === "grouped-customer" ? "/review/customer/grouped/" : `/review/${kind === "customer" ? "deur" : "manager"}/`;
    if (!path.startsWith(expectedPath) || !intentId) {
      throw new Error("Trusted issuance response omitted its one-time delivery handoff.");
    }
    const intent = await this.repository.getIntent(intentId);
    const workerId = randomUUID();
    if (!(await this.repository.claim(intent.id, workerId))) return { ...result, deliveryStatus: "NOT_CLAIMED" };
    const reviewUrl = new URL(path, this.publicBaseUrl).toString();
    const email = renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl });
    const providerResult = await this.provider.send({
      from: this.from, to: intent.recipient.destination,
      recipientName: intent.recipient.displayName, email, idempotencyKey: intent.idempotencyKey,
    });
    const sanitized = structuredClone(result);
    sanitized.reviewPath = undefined;
    const nested = (sanitized as any).value?.notification;
    if (nested && typeof nested === "object") delete nested.reviewPath;
    if (providerResult.accepted) {
      await this.repository.complete({
        id: intent.id, workerId, status: "ProviderAccepted",
        providerName: providerResult.provider, providerMessageId: providerResult.providerMessageId,
      });
      return { ...sanitized, deliveryStatus: "ProviderAccepted" };
    }
    const decision = decideNotificationFailure(providerResult.category, true, intent.attempt);
    await this.repository.complete({
      id: intent.id, workerId, status: decision.status, failureCategory: providerResult.category,
    });
    return { ...sanitized, deliveryStatus: decision.status };
  }
}
