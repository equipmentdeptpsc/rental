import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationIntent } from "../../src/features/notifications/domain";
import type {
  ClaimedNotification, TrustedNotificationWorkerRepository,
} from "./TrustedNotificationWorker";
import type {
  TrustedReviewIssuanceRepository, TrustedReviewIssuanceResult,
} from "./TrustedReviewIssuanceOrchestrator";

type RpcResult<T> = { success: boolean; code?: string; disposition?: string; value?: T };

export class SupabaseTrustedNotificationRepository
implements TrustedNotificationWorkerRepository, TrustedReviewIssuanceRepository {
  constructor(
    private readonly authenticated: SupabaseClient,
    private readonly service: SupabaseClient,
  ) {}

  private async rpc<T>(client: SupabaseClient, name: string, parameters: Record<string, unknown>): Promise<T> {
    const result = await client.schema("erp").rpc(name, parameters);
    if (result.error) throw new Error(`${name} failed (${result.error.code ?? "transport"})`);
    return result.data as T;
  }

  async issue(kind: "customer" | "manager", command: Record<string, unknown>): Promise<TrustedReviewIssuanceResult> {
    const name = kind === "customer" ? "trusted_issue_customer_review" : "trusted_issue_manager_review";
    const result = await this.rpc<Record<string, any>>(this.authenticated, name, { command });
    return {
      ...result,
      success: result?.success === true,
      reviewPath: result?.value?.notification?.reviewPath,
      notificationIntentId: result?.value?.notificationIntentId,
    };
  }

  async getIntent(id: string): Promise<NotificationIntent & { attempt: number }> {
    const result = await this.rpc<RpcResult<NotificationIntent & { attempt: number }>>(
      this.service, "get_notification_delivery_intent", { notification_id: id },
    );
    if (!result.success || !result.value) throw new Error("Notification intent is unavailable.");
    return result.value;
  }

  async claim(id: string, workerId: string): Promise<boolean> {
    const result = await this.rpc<RpcResult<unknown>>(this.service, "claim_notification_delivery", {
      notification_id: id, worker_id: workerId,
    });
    return result.success;
  }

  async claimBatch(workerId: string, limit: number): Promise<ClaimedNotification[]> {
    const result = await this.rpc<RpcResult<Array<{ id: string }>>>(
      this.service, "claim_notification_delivery_batch", { worker_id: workerId, batch_size: limit },
    );
    if (!result.success) return [];
    return Promise.all((result.value ?? []).filter(Boolean).map((item) => this.getIntent(item.id)));
  }

  async complete(input: Parameters<TrustedNotificationWorkerRepository["complete"]>[0]): Promise<void> {
    const result = await this.rpc<RpcResult<unknown>>(this.service, "complete_notification_delivery", {
      command: {
        id: input.id, workerId: input.workerId, status: input.status,
        providerName: input.providerName, providerMessageId: input.providerMessageId,
        failureCategory: input.failureCategory, retryAfterSeconds: input.retryAfterSeconds,
      },
    });
    if (!result.success) throw new Error(`Notification completion rejected (${result.code ?? "unknown"}).`);
  }
}
