import { createClient } from "@supabase/supabase-js";
import { GuardedProjectReviewFirstDelivery, GUARDED_PROJECT_REVIEW_SCOPE,
  type GuardedDeliveryPhase, type GuardedDeliveryRequest } from "../server/notifications/GuardedProjectReviewFirstDelivery";
import { ResendEmailDeliveryProvider, verifyResendAuthentication } from "../server/notifications/ResendEmailDeliveryProvider";
import { SupabaseTrustedNotificationRepository } from "../server/notifications/SupabaseTrustedNotificationRepository";
import { TrustedNotificationWorker } from "../server/notifications/TrustedNotificationWorker";
import { parseWorkerConfiguration, type GroupedReviewWorkerEnvironment } from "./configuration";
import { fingerprintNormalizedEmail } from "./uatRecipientOverrideVerification";

type SafeResult = { status: number; body: Record<string, unknown> };
const safe = (status: number, body: Record<string, unknown>): SafeResult => ({ status, body });
const validSender = (value: string) => !/[\r\n]/.test(value) && value.length <= 320 &&
  (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || /^.{1,200}<[^@\s]+@[^@\s]+\.[^@\s]+>$/.test(value));

export async function runGuardedProjectReviewFirstDelivery(
  request: Request, environment: GroupedReviewWorkerEnvironment, phase: GuardedDeliveryPhase,
): Promise<SafeResult> {
  if (environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER !== "true") return safe(503, { success: false, code: "UAT_GUARD_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return safe(401, { success: false, code: "UNAUTHENTICATED" });
  const config = parseWorkerConfiguration(environment, "NOTIFICATION_RETRY_WORKER");
  if (new URL(config.supabaseUrl).hostname !== `${GUARDED_PROJECT_REVIEW_SCOPE.supabaseProject}.supabase.co`) {
    return safe(409, { success: false, code: "SUPABASE_PROJECT_MISMATCH" });
  }
  if (!config.uatRecipientOverride || !validSender(config.fromAddress)) {
    return safe(503, { success: false, code: "DELIVERY_CONFIGURATION_INVALID" });
  }
  const service = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return safe(401, { success: false, code: "UNAUTHENTICATED" });
  const actorId = identity.data.user.id;
  const [permission, administrator] = await Promise.all([
    service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", actorId).eq("permission_code", "settings.update").maybeSingle(),
    service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id", actorId)
      .eq("app_roles.code", "system-administrator").eq("app_roles.active", true).is("app_roles.deprecated_at", null).maybeSingle(),
  ]);
  if (permission.error || administrator.error || !permission.data || !administrator.data) return safe(403, { success: false, code: "FORBIDDEN" });
  const body = await request.json().catch(() => null) as GuardedDeliveryRequest | null;
  if (!body || Object.keys(body).sort().join(",") !== "confirmation,recipientOverrideFingerprint") {
    return safe(400, { success: false, code: "VALIDATION_REJECTED" });
  }
  const configuredFingerprint = await fingerprintNormalizedEmail(config.uatRecipientOverride);
  const publicReview = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = new SupabaseTrustedNotificationRepository(service, service, config.encryptionKey, publicReview);
  const provider = new ResendEmailDeliveryProvider({ apiKey: config.resendApiKey, uatRecipientOverride: config.uatRecipientOverride });
  const worker = new TrustedNotificationWorker(repository, provider, config.fromAddress, 1, config.publicBaseUrl, undefined, true);
  const procedure = new GuardedProjectReviewFirstDelivery({ repository,
    providerReady: () => verifyResendAuthentication(config.resendApiKey),
    recipientOverrideMatches: async fingerprint => fingerprint === configuredFingerprint,
    dispatch: (notificationId, workerId) => worker.runExistingNotificationDetailed(notificationId, workerId, { terminalReviewFailure: true }),
  });
  const result = await procedure.run(actorId, phase, body);
  return safe(result.success ? 200 : result.ambiguous ? 424 : 409, result as unknown as Record<string, unknown>);
}
