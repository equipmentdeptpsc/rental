import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type SafeResult = { status: number; body: Record<string, unknown> };
const safe = (status: number, body: Record<string, unknown>): SafeResult => ({ status, body });

export async function resolveUatGroupedReviewDispatch(request: Request, environment: GroupedReviewWorkerEnvironment): Promise<SafeResult> {
  if (environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER !== "true" || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return safe(503, { success: false, code: "UAT_RESOLVER_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return safe(401, { success: false, code: "UNAUTHENTICATED" });
  const service = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return safe(401, { success: false, code: "UNAUTHENTICATED" });
  const permitted = await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", identity.data.user.id).eq("permission_code", "settings.update").maybeSingle();
  if (permitted.error || !permitted.data) return safe(403, { success: false, code: "FORBIDDEN" });
  const administrator = await service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id", identity.data.user.id).eq("app_roles.code", "system-administrator").eq("app_roles.active", true).is("app_roles.deprecated_at", null).maybeSingle();
  if (administrator.error || !administrator.data) return safe(403, { success: false, code: "FORBIDDEN" });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.rentalId !== "string" || typeof body.workDate !== "string" || (body.deurId !== undefined && typeof body.deurId !== "string") || (body.deurNumber !== undefined && typeof body.deurNumber !== "string")) return safe(400, { success: false, code: "VALIDATION_REJECTED" });
  if ("notificationId" in body || "reviewRequestId" in body) return safe(400, { success: false, code: "VALIDATION_REJECTED" });
  const command = { rentalId: body.rentalId, workDate: body.workDate, ...(body.deurNumber ? { deurNumber: body.deurNumber } : {}) };
  const result = await service.schema("erp").rpc("resolve_isolated_uat_grouped_review_dispatch", { command });
  const value = result.data as Record<string, unknown> | null;
  if (result.error || !value || typeof value.success !== "boolean") return safe(409, { success: false, code: "RESOLUTION_FAILED" });
  if (!value.success) return safe(409, { success: false, code: typeof value.code === "string" ? value.code : "RESOLUTION_FAILED" });
  if (!value.value || typeof value.value !== "object") return safe(409, { success: false, code: "RESOLUTION_MALFORMED" });
  return safe(200, { success: true, value: value.value });
}
