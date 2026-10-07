import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type Json = Record<string, unknown>;
type Result = { status: number; body: Json };
const KEY = "BILLING_SINGLE_RENTAL_V1";
const PROFILE = "UAT_BILLING_SINGLE_RENTAL_V1";
const WORK_DATE = "2026-09-30";
const ok = (status: number, body: Json): Result => ({ status, body });
const command = (stage: string, id: string) => ({
  commandId: `UAT-BILLING-SINGLE-${stage}-${id}`,
  idempotencyKey: `uat-billing-single:${stage.toLowerCase()}:${id}`,
});

async function canonical(client: any, name: string, payload: Json): Promise<Json> {
  const result = await client.schema("erp").rpc(name, { command: payload });
  const value = result.data as Json | null;
  if (result.error || value?.success !== true) throw new Error(`${name}:${String(value?.code ?? "CANONICAL_COMMAND_FAILED")}`);
  return value;
}

async function authContext(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (env.ENABLE_UAT_SYNTHETIC_PROVISIONER !== "true" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return null;
  const [user, permission, role] = await Promise.all([
    service.schema("erp").from("users").select("company_id").eq("id", identity.data.user.id).eq("status", "active").maybeSingle(),
    service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", identity.data.user.id).eq("permission_code", "settings.update").maybeSingle(),
    service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id", identity.data.user.id).eq("app_roles.code", "system-administrator").eq("app_roles.active", true).is("app_roles.deprecated_at", null).maybeSingle(),
  ]);
  if (user.error || !user.data || permission.error || !permission.data || role.error || !role.data) return null;
  return { token, actorId: identity.data.user.id, companyId: String(user.data.company_id), service };
}

async function inspect(service: any, companyId: string): Promise<Result> {
  const result = await service.schema("erp").rpc("inspect_uat_single_billing_fixture", { command: { companyId, scenarioKey: KEY, profileVersion: PROFILE } });
  if (result.error || !(result.data as Json | null)?.success) return ok(409, { success: false, code: (result.data as Json | null)?.code ?? "READ_FAILED" });
  return ok(200, result.data as Json);
}

export async function inspectUatSingleBillingFixture(request: Request, env: GroupedReviewWorkerEnvironment): Promise<Result> {
  const context = await authContext(request, env);
  if (!context) return ok(401, { success: false, code: "UNAUTHENTICATED_OR_FORBIDDEN" });
  const body = await request.json().catch(() => null) as Json | null;
  if (!body || body.scenarioKey !== KEY || (body.profileVersion !== undefined && body.profileVersion !== PROFILE)) return ok(400, { success: false, code: "VALIDATION_REJECTED" });
  return inspect(context.service, context.companyId);
}

export async function provisionUatSingleBillingFixture(request: Request, env: GroupedReviewWorkerEnvironment): Promise<Result> {
  const context = await authContext(request, env);
  if (!context) return ok(401, { success: false, code: "UNAUTHENTICATED_OR_FORBIDDEN" });
  const body = await request.json().catch(() => null) as Json | null;
  if (!body || Object.keys(body).some(key => key !== "scenarioKey" && key !== "profileVersion") || body.scenarioKey !== KEY || (body.profileVersion !== undefined && body.profileVersion !== PROFILE)) return ok(400, { success: false, code: "VALIDATION_REJECTED" });

  const refsResult = await context.service.schema("erp").rpc("resolve_uat_single_billing_fixture_references", { command: { companyId: context.companyId, scenarioKey: KEY, profileVersion: PROFILE } });
  const refs = refsResult.data as Json | null;
  if (refsResult.error || refs?.success !== true) return ok(409, { success: false, code: refs?.code ?? "UAT_REFERENCE_UNAVAILABLE" });
  const claimResult = await context.service.schema("erp").rpc("claim_uat_single_billing_fixture", { command: { companyId: context.companyId, scenarioKey: KEY, profileVersion: PROFILE, references: { costCodeId: refs.costCodeId, activityCodeId: refs.activityCodeId, workDescriptionId: refs.workDescriptionId } } });
  const claim = claimResult.data as Json | null;
  if (claimResult.error || claim?.success !== true) return ok(409, { success: false, code: claim?.code ?? "SCENARIO_CLAIM_FAILED" });
  const scenario = claim.scenario as Json;
  if (claim.state === "READY") return inspect(context.service, context.companyId);

  const user = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${context.token}` } } });
  try {
    const partial = await inspect(context.service, context.companyId);
    const counts = partial.body.counts as Json | undefined;
    const resumeExistingRental = partial.status === 200 && counts?.rentals === 1 && counts?.lines === 1 && partial.body.rentalId === scenario.rentalId;
    if (!resumeExistingRental) {
      await canonical(user, "command_create_customer", { ...command("CUSTOMER", String(scenario.customerId)), customerId: scenario.customerId, customerCode: "UAT-BILLING-SINGLE-CUSTOMER-001", name: "Synthetic UAT Billing Certification Customer" });
      await canonical(user, "command_create_project", { ...command("PROJECT", String(scenario.projectId)), projectId: scenario.projectId, projectCode: "UAT-BILLING-SINGLE-PROJECT-001", name: "Synthetic UAT Billing Certification Project", customerId: scenario.customerId, location: "Isolated UAT" });
      await canonical(user, "command_create_operator", { ...command("OPERATOR", String(scenario.operatorId)), operatorId: scenario.operatorId, name: "Synthetic UAT Billing Certification Operator", certificationType: "Heavy Machinery", joinedDate: WORK_DATE });
      await canonical(user, "command_create_equipment", { ...command("EQUIPMENT", String(scenario.equipmentId)), equipmentId: scenario.equipmentId, assetNo: "UAT-BILLING-SINGLE-EQ-001", equipmentName: "Synthetic UAT Billing Certification Equipment", maintenanceType: "Engine Hours", costCodeId: refs.costCodeId, currentReading: 0, remarks: "Synthetic isolated-UAT billing certification equipment." });
      await canonical(user, "command_create_assignment", { ...command("ASSIGNMENT", String(scenario.assignmentId)), assignmentId: scenario.assignmentId, equipmentId: scenario.equipmentId, operatorId: scenario.operatorId, projectId: scenario.projectId, activityCodeId: refs.activityCodeId, assignedDate: WORK_DATE, expectedReturn: WORK_DATE, remarks: "Synthetic isolated-UAT billing certification assignment." });
      await canonical(user, "command_create_reserved_rental", { ...command("RENTAL", String(scenario.rentalId)), rentalId: scenario.rentalId, rentalNumber: "UAT-BILLING-SINGLE-20260930", customerId: scenario.customerId, projectId: scenario.projectId, dateOut: WORK_DATE, expectedReturn: WORK_DATE, rentalType: "Operated Rental", lines: [{ id: scenario.lineId, equipmentId: scenario.equipmentId, assignmentId: scenario.assignmentId, operatorId: scenario.operatorId }] });
      await canonical(user, "command_prepare_reserved_rental_aggregate", { ...command("PREPARE", String(scenario.rentalId)), expectedRentalVersion: 1, rentalId: scenario.rentalId, lines: [{ lineId: scenario.lineId, commercialTerms: { billingMethod: "Per Hour", unitRate: 1000, minimumBillableHours: 0, overtimeRate: 0, standbyRate: 0, mobilizationFee: 0, demobilizationFee: 0, fuelCharge: 0, operatorIncluded: true, operatorRate: 0, taxRate: 0, withholdingTax: 0, contractAmount: 0, currency: "PHP" }, costCodeId: refs.costCodeId, activityCodeId: refs.activityCodeId, workDescriptionId: refs.workDescriptionId, operationalRemarks: "Synthetic isolated-UAT billing certification runtime.", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: WORK_DATE, timezone: "Asia/Manila" }, shiftWindows: [], workDate: WORK_DATE, meterRequirement: "hourMeter" }] });
      await canonical(user, "command_release_rental", { ...command("RELEASE", String(scenario.rentalId)), rentalId: scenario.rentalId, expectedVersion: 2 });
      await canonical(user, "command_activate_rental", { ...command("ACTIVATE", String(scenario.rentalId)), rentalId: scenario.rentalId, expectedVersion: 3 });
      const reviewConfig = await context.service.schema("erp").rpc("configure_uat_single_billing_fixture_customer_review", { command: { ...command("REVIEW-CONFIG", String(scenario.rentalId)), companyId: context.companyId, actorId: context.actorId, scenarioKey: KEY, rentalId: scenario.rentalId, customerId: scenario.customerId, representativeName: "Synthetic UAT Billing Contact", representativeEmail: "uat-billing-contact@example.invalid" } });
      if (reviewConfig.error || (reviewConfig.data as Json | null)?.success !== true) throw new Error(`REVIEW_CONFIG:${String((reviewConfig.data as Json | null)?.code ?? "FAILED")}:${String((reviewConfig.data as Json | null)?.sqlstate ?? "")}`);
    } else {
      const reviewConfig = await context.service.schema("erp").rpc("configure_uat_single_billing_fixture_customer_review", { command: { ...command("REVIEW-CONFIG", String(scenario.rentalId)), companyId: context.companyId, actorId: context.actorId, scenarioKey: KEY, rentalId: scenario.rentalId, customerId: scenario.customerId, representativeName: "Synthetic UAT Billing Contact", representativeEmail: "uat-billing-contact@example.invalid" } });
      if (reviewConfig.error || (reviewConfig.data as Json | null)?.success !== true) throw new Error(`REVIEW_CONFIG:${String((reviewConfig.data as Json | null)?.code ?? "FAILED")}:${String((reviewConfig.data as Json | null)?.sqlstate ?? "")}`);
    }
    const fixtureDeur = await context.service.schema("erp").rpc("provision_uat_single_billing_fixture_deur", { command: { ...command("DEUR", String(scenario.deurId)), companyId: context.companyId, actorId: context.actorId, scenarioKey: KEY, profileVersion: PROFILE, deurId: scenario.deurId, rentalId: scenario.rentalId, rentalEquipmentLineId: scenario.lineId, workDate: WORK_DATE, evidence: { shift: "Day", shiftStart: "2026-09-30T01:00:00Z", shiftEnd: "2026-09-30T02:00:00Z", intervals: [{ activityType: "operation", start: "2026-09-30T01:00:00Z", end: "2026-09-30T02:00:00Z" }] } } });
    if (fixtureDeur.error || (fixtureDeur.data as Json | null)?.success !== true) throw new Error(`DEUR:${String((fixtureDeur.data as Json | null)?.code ?? "FAILED")}:${String((fixtureDeur.data as Json | null)?.sqlstate ?? "")}`);
    await canonical(user, "command_create_customer_review_request", { ...command("REVIEW", String(scenario.deurId)), deurId: scenario.deurId, revisionId: scenario.deurId, rentalLineId: scenario.lineId });
    const ack = await context.service.schema("erp").rpc("acknowledge_uat_single_billing_fixture_review", { command: { ...command("ACK", String(scenario.deurId)), companyId: context.companyId, scenarioKey: KEY, deurId: scenario.deurId } });
    if (ack.error || (ack.data as Json | null)?.success !== true) throw new Error(`REVIEW_ACK:${String((ack.data as Json | null)?.code ?? "FAILED")}`);
    const complete = await context.service.schema("erp").rpc("complete_uat_single_billing_fixture", { command: { companyId: context.companyId, scenarioKey: KEY } });
    if (complete.error || (complete.data as Json | null)?.success !== true) throw new Error(`COMPLETE:${String((complete.data as Json | null)?.code ?? "FAILED")}`);
    return inspect(context.service, context.companyId);
  } catch (error) {
    const parts = String(error instanceof Error ? error.message : "UNKNOWN").split(":");
    return ok(409, { success: false, code: "UAT_SINGLE_BILLING_FIXTURE_FAILED", stage: parts[0] ?? "UNKNOWN", errorCode: parts.slice(1).join(":") || "UNKNOWN" });
  }
}
