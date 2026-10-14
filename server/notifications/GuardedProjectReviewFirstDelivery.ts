import { randomUUID } from "node:crypto";
import type { ExistingNotificationDeliveryResult } from "./TrustedNotificationWorker";

export const GUARDED_PROJECT_REVIEW_SCOPE = Object.freeze({
  supabaseProject: "jtkctarqbwmqdcewthkn",
  deurNumber: "DEUR-2026-000030",
  batchId: "aac56cd2-6b52-4376-a1f9-e6e833b4a02d",
  notificationIds: [
    "339135fc-477b-4ad8-bd3c-2ad17853f9d4",
    "45e60b4f-e7fc-4d27-87a9-1672e2fa1cc9",
  ] as const,
});

export type GuardedDeliveryPhase = "PREFLIGHT" | "EXECUTE";
export interface GuardedDeliveryRequest { confirmation: "PROJECT-LEGACY-FIRST-DELIVERY"; recipientOverrideFingerprint: string }
export interface GuardedDeliveryRepository {
  preflightGuardedProjectReviewFirstDelivery(input: {
    actorId: string; batchId: string; deurNumber: string; notificationIds: readonly string[];
    phase: "BEFORE_PREPARATION" | "AFTER_PREPARATION";
  }): Promise<{ success: boolean; code?: string; disposition?: string }>;
  prepareExactProjectReviewBatch(batchId: string, notificationIds: readonly string[]): Promise<{ success: boolean; code?: string; disposition?: string }>;
}
export interface GuardedDeliveryDependencies {
  repository: GuardedDeliveryRepository;
  providerReady(): Promise<"VALID" | "INVALID" | "UNAVAILABLE">;
  recipientOverrideMatches(fingerprint: string): Promise<boolean>;
  dispatch(notificationId: string, workerId: ReturnType<typeof randomUUID>): Promise<ExistingNotificationDeliveryResult>;
}
export type GuardedDeliveryResult =
  | { success: true; disposition: "PREFLIGHT_READY"; prepared: false; dispatched: readonly [] }
  | { success: true; disposition: "DELIVERED"; prepared: true; dispatched: readonly string[] }
  | { success: false; code: string; prepared: boolean; dispatched: readonly string[]; ambiguous?: boolean };

export class GuardedProjectReviewFirstDelivery {
  constructor(private readonly dependencies: GuardedDeliveryDependencies) {}

  async run(actorId: string, phase: GuardedDeliveryPhase, request: GuardedDeliveryRequest): Promise<GuardedDeliveryResult> {
    if (request.confirmation !== "PROJECT-LEGACY-FIRST-DELIVERY" || !/^[0-9a-f]{64}$/.test(request.recipientOverrideFingerprint)) {
      return { success: false, code: "VALIDATION_REJECTED", prepared: false, dispatched: [] };
    }
    if (!await this.dependencies.recipientOverrideMatches(request.recipientOverrideFingerprint)) {
      return { success: false, code: "RECIPIENT_OVERRIDE_MISMATCH", prepared: false, dispatched: [] };
    }
    const scope = GUARDED_PROJECT_REVIEW_SCOPE;
    const before = await this.dependencies.repository.preflightGuardedProjectReviewFirstDelivery({
      actorId, batchId: scope.batchId, deurNumber: scope.deurNumber,
      notificationIds: scope.notificationIds, phase: "BEFORE_PREPARATION",
    });
    if (!before.success) return { success: false, code: before.code ?? "PREFLIGHT_REJECTED", prepared: false, dispatched: [] };
    const readiness = await this.dependencies.providerReady();
    if (readiness !== "VALID") return { success: false, code: `PROVIDER_${readiness}`, prepared: false, dispatched: [] };
    if (phase === "PREFLIGHT") return { success: true, disposition: "PREFLIGHT_READY", prepared: false, dispatched: [] };

    const prepared = await this.dependencies.repository.prepareExactProjectReviewBatch(scope.batchId, scope.notificationIds);
    if (!prepared.success || !["PREPARED", "REPLAYED"].includes(prepared.disposition ?? "")) {
      return { success: false, code: prepared.code ?? "PREPARATION_REJECTED", prepared: false, dispatched: [] };
    }
    const after = await this.dependencies.repository.preflightGuardedProjectReviewFirstDelivery({
      actorId, batchId: scope.batchId, deurNumber: scope.deurNumber,
      notificationIds: scope.notificationIds, phase: "AFTER_PREPARATION",
    });
    if (!after.success) return { success: false, code: after.code ?? "REVALIDATION_REJECTED", prepared: true, dispatched: [] };

    const dispatched: string[] = [];
    for (const notificationId of scope.notificationIds) {
      const result = await this.dependencies.dispatch(notificationId, randomUUID());
      if (result.claimed !== 1) return { success: false, code: "NOTIFICATION_NOT_CLAIMED", prepared: true, dispatched };
      dispatched.push(notificationId);
      if (result.ambiguous || result.status === "UnknownOutcome") {
        return { success: false, code: "AMBIGUOUS_PROVIDER_OUTCOME", prepared: true, dispatched, ambiguous: true };
      }
      if (result.status !== "ProviderAccepted") {
        return { success: false, code: "PROVIDER_DELIVERY_FAILED", prepared: true, dispatched };
      }
    }
    return { success: true, disposition: "DELIVERED", prepared: true, dispatched };
  }
}
