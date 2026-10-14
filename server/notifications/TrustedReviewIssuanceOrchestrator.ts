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
  notificationIntentIds?: string[];
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
    if (!result.success || result.disposition === "REPLAYED" ||
      (kind === "grouped-customer" && result.disposition !== "CREATED")) return result;
    const intentIds = kind === "grouped-customer" && Array.isArray(result.notificationIntentIds)
      ? result.notificationIntentIds.filter((id): id is string => typeof id === "string")
      : typeof result.notificationIntentId === "string" ? [result.notificationIntentId] : [];
    const intentId = intentIds[0] ?? "";
    const persistedPath = kind === "grouped-customer" && intentId ? await this.repository.getGroupedReviewPath?.(intentId) : undefined;
    const path = persistedPath ?? (typeof result.reviewPath === "string" ? result.reviewPath : "");
    const expectedPath = kind === "grouped-customer" ? "/review/customer/grouped/" : `/review/${kind === "customer" ? "deur" : "manager"}/`;
    if (!path.startsWith(expectedPath) || !intentId) {
      throw new Error("Trusted issuance response omitted its one-time delivery handoff.");
    }
    const reviewUrl = new URL(path, this.publicBaseUrl).toString();
    const sanitized = structuredClone(result);
    sanitized.reviewPath = undefined;
    const nested = (sanitized as any).value?.notification;
    if (nested && typeof nested === "object") delete nested.reviewPath;
    const deliveryStatuses: string[] = [];
    for (const nextIntentId of intentIds) {
      const intent = await this.repository.getIntent(nextIntentId);
      const workerId = randomUUID();
      if (!(await this.repository.claim(intent.id, workerId))) { deliveryStatuses.push("NOT_CLAIMED"); continue; }
      const email = renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl });
      const providerResult = await this.provider.send({
        from: this.from, to: intent.recipient.destination,
        recipientName: intent.recipient.displayName, email, idempotencyKey: intent.idempotencyKey,
      });
      if (providerResult.accepted) {
        await this.repository.complete({
          id: intent.id, workerId, status: "ProviderAccepted",
          providerName: providerResult.provider, providerMessageId: providerResult.providerMessageId,
        });
        deliveryStatuses.push("ProviderAccepted");
      } else {
        const decision = decideNotificationFailure(providerResult.category, true, intent.attempt);
        await this.repository.complete({
          id: intent.id, workerId, status: decision.status, failureCategory: providerResult.category,
        });
        deliveryStatuses.push(decision.status);
      }
    }
    return { ...sanitized, deliveryStatus: deliveryStatuses.every(status => status === "ProviderAccepted")
      ? "ProviderAccepted" : deliveryStatuses.join(",") };
  }
}
