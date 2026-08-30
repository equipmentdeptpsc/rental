import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type Row = Record<string, unknown>;
const output = (status: number, body: Row) => ({ status, body: { inspectionImplementationVersion: "uat-deur-turnover-read-v1", ...body } });

export async function inspectUatDeurTurnover(request: Request, environment: GroupedReviewWorkerEnvironment) {
  if (environment.ENABLE_UAT_SYNTHETIC_PROVISIONER !== "true" || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return output(503, { success: false, code: "UAT_PROVISIONER_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return output(401, { success: false, code: "UNAUTHENTICATED" });
  const service = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return output(401, { success: false, code: "UNAUTHENTICATED" });
  const actor = identity.data.user.id;
  const [applicationUser, permission] = await Promise.all([
    service.schema("erp").from("users").select("company_id,status").eq("id", actor).maybeSingle(),
    service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", actor).eq("permission_code", "settings.update").maybeSingle(),
  ]);
  if (applicationUser.error || !applicationUser.data || applicationUser.data.status !== "active" || permission.error || !permission.data) return output(403, { success: false, code: "FORBIDDEN" });
  const body = await request.json().catch(() => null) as Row | null;
  if (!body || Object.keys(body).length !== 4 || body.scenarioKey !== "MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29" || body.profileVersion !== "UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1" || typeof body.expectedDeurNumber !== "string" || !/^[A-Z]+-\d{4}-\d{6}$/.test(body.expectedDeurNumber) || body.expectedWorkDate !== "2026-08-30") return output(400, { success: false, code: "VALIDATION_REJECTED" });
  const read = await service.schema("erp").rpc("inspect_isolated_uat_deur_turnover", { command: { companyId: applicationUser.data.company_id, ...body } });
  if (read.error) return output(503, { success: false, code: "READ_FAILED" });
  return output(200, read.data as Row);
}
