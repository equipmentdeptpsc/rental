import { randomUUID } from "node:crypto";
import type { EmailDeliveryProvider } from "../../src/features/notifications/EmailDeliveryProvider";
import type { DeliveryStatus, NotificationIntent } from "../../src/features/notifications/domain";
import { renderNotificationTemplate } from "../../src/features/notifications/templates";
import { decideNotificationFailure } from "./NotificationRetryPolicy";
import type { InvoiceDocument } from "../../src/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import { sendBillingStatementEmail } from "../../src/features/rental/billing-email/sendBillingStatementEmail";

export interface ClaimedNotification extends NotificationIntent { attempt: number }
export type GroupedReviewDeliveryResolution =
  | { status: "ACTIVE"; reviewPath: string }
  | { status: "EXPIRED" | "SUPERSEDED" | "MISSING" };
export interface TrustedNotificationWorkerRepository {
  claimBatch(workerId: string, limit: number): Promise<ClaimedNotification[]>;
  complete(input: {
    id: string; workerId: string; status: DeliveryStatus; providerName?: string;
    providerMessageId?: string; failureCategory?: string; retryAfterSeconds?: number;
    notificationType?: NotificationIntent["type"]; uatOverrideApplied?: boolean;
  }): Promise<void>;
  getGroupedReviewPath?(id: string): Promise<string | undefined>;
  resolveGroupedReviewDelivery?(id: string): Promise<GroupedReviewDeliveryResolution>;
  loadBillingStatementDocument?(statementId: string, companyId: string, sourceVersion: number): Promise<InvoiceDocument | undefined>;
}
export interface SafeProviderOutcomeLogger { log(event: Record<string, unknown>): void }

export class TrustedNotificationWorker {
  constructor(
    private readonly repository: TrustedNotificationWorkerRepository,
    private readonly provider: EmailDeliveryProvider,
    private readonly from: string,
    private readonly batchSize = 10,
    private readonly publicBaseUrl = "https://review.invalid/",
    private readonly logger?: SafeProviderOutcomeLogger,
    private readonly uatOverrideApplied = false,
  ) {}

  async runOnce(workerId = randomUUID()): Promise<{ claimed: number; providerCalls: number }> {
    const claimed = await this.repository.claimBatch(workerId, Math.max(1, Math.min(this.batchSize, 50)));
    let providerCalls = 0;
    for (const intent of claimed) {
      if (intent.type === "BILLING_STATEMENT_EMAIL") {
        const sourceVersion = Number(intent.input.sourceVersion);
        const document = Number.isSafeInteger(sourceVersion) && sourceVersion > 0
          ? await this.repository.loadBillingStatementDocument?.(intent.sourceAggregateId, intent.companyId, sourceVersion)
          : undefined;
        if (!document) { await this.repository.complete({ id:intent.id,workerId,status:"DeadLetter",failureCategory:"Cancelled",notificationType:intent.type,uatOverrideApplied:this.uatOverrideApplied }); continue; }
        const delivered = await sendBillingStatementEmail({ document, provider:this.provider, from:this.from, idempotencyKey:intent.idempotencyKey });
        if (delivered.success) { providerCalls++; await this.repository.complete({ id:intent.id,workerId,status:"ProviderAccepted",providerName:delivered.provider,providerMessageId:delivered.providerMessageId,notificationType:intent.type,uatOverrideApplied:this.uatOverrideApplied }); continue; }
        if (delivered.code === "PDF_GENERATION_FAILED" || delivered.code === "RECIPIENT_REQUIRED") { await this.repository.complete({ id:intent.id,workerId,status:"DeadLetter",failureCategory:delivered.code === "PDF_GENERATION_FAILED"?"TemplateFailure":"InvalidRecipient",notificationType:intent.type,uatOverrideApplied:this.uatOverrideApplied }); continue; }
        providerCalls++; const failure=delivered.delivery&&!delivered.delivery.accepted?delivered.delivery:undefined; const decision=decideNotificationFailure(failure?.category??"UnknownProviderFailure",false,intent.attempt,failure?.retryAfterSeconds);
        await this.repository.complete({id:intent.id,workerId,status:decision.status,failureCategory:failure?.category??"UnknownProviderFailure",retryAfterSeconds:decision.delaySeconds,notificationType:intent.type,uatOverrideApplied:this.uatOverrideApplied}); continue;
      }
      let reviewUrl: string | undefined;
      if (intent.requiresReviewCredential) {
        const resolution = await this.repository.resolveGroupedReviewDelivery?.(intent.id);
        if (resolution?.status === "EXPIRED" || resolution?.status === "SUPERSEDED") {
          await this.repository.complete({ id: intent.id, workerId,
            status: resolution.status === "SUPERSEDED" ? "Superseded" : "Cancelled",
            failureCategory: resolution.status === "SUPERSEDED" ? "Superseded" : "Cancelled" });
          continue;
        }
        const path = resolution?.status === "ACTIVE" ? resolution.reviewPath
          : await this.repository.getGroupedReviewPath?.(intent.id);
        if (!path) {
          await this.repository.complete({ id: intent.id, workerId, status: "FailedCredentialLost", failureCategory: "Cancelled" });
          continue;
        }
        reviewUrl = new URL(path, this.publicBaseUrl).toString();
      }
      let email;
      try { email = renderNotificationTemplate(intent.type, { ...intent.input, ...(reviewUrl ? { reviewUrl } : {}) }); }
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
        this.logger?.log({ provider: result.provider, outcomeCategory: "ProviderAccepted",
          deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable: false, attempt: intent.attempt });
        await this.repository.complete({
          id: intent.id, workerId, status: "ProviderAccepted",
          providerName: result.provider, providerMessageId: result.providerMessageId,
        });
      } else {
        const decision = decideNotificationFailure(
          result.category, false, intent.attempt, result.retryAfterSeconds,
        );
        this.logger?.log({ provider: result.provider, outcomeCategory: result.category,
          deliveryOutcome: result.diagnostic?.deliveryOutcome ?? "UNKNOWN_DELIVERY_OUTCOME",
          retryable: decision.retryable, attempt: intent.attempt,
          ...(result.diagnostic?.exceptionName ? { exceptionName: result.diagnostic.exceptionName } : {}),
          ...(result.diagnostic?.httpStatus ? { httpStatus: result.diagnostic.httpStatus } : {}) });
        await this.repository.complete({
          id: intent.id, workerId, status: decision.status,
          failureCategory: result.category, retryAfterSeconds: decision.delaySeconds,
        });
      }
    }
    return { claimed: claimed.length, providerCalls };
  }
}
