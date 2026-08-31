import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type Json = Record<string, unknown>;
type SafeResult = { status: number; body: Json };
const out = (status: number, body: Json): SafeResult => ({ status, body });
const KEY = "DEUR-TURNOVER-RUNTIME-CERT-2026-08-31";
const PROFILE = "UAT_DEUR_TURNOVER_RUNTIME_V1";
const WORK_DATE = new Date().toISOString().slice(0, 10);

async function canonical(client: any, name: string, command: Json): Promise<Json> {
  const response = await client.schema("erp").rpc(name, { command });
  const value = response.data as Json | null;
  if (response.error || value?.success !== true) throw new Error(String(value?.code ?? "CANONICAL_COMMAND_FAILED"));
  return value;
}
async function stage<T>(name: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) { const code = error instanceof Error ? error.message : "CANONICAL_COMMAND_FAILED"; throw new Error(`UAT_TURNOVER_SCENARIO_FAILED:${name}:${code}`); }
}

export async function provisionUatDeurTurnoverDomain(request: Request, env: GroupedReviewWorkerEnvironment): Promise<SafeResult> {
  if (env.ENABLE_UAT_SYNTHETIC_PROVISIONER !== "true" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_PUBLISHABLE_KEY) return out(503, { success: false, code: "UAT_PROVISIONER_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return out(401, { success: false, code: "UNAUTHENTICATED" });
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return out(401, { success: false, code: "UNAUTHENTICATED" });
  const actorId = identity.data.user.id;
  const actor = await service.schema("erp").from("users").select("id,company_id,status").eq("id", actorId).eq("status", "active").maybeSingle();
  if (actor.error || !actor.data) return out(403, { success: false, code: "FORBIDDEN" });
  const permission = await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", actorId).in("permission_code", ["settings.update", "customer.create", "project.manage", "operator.manage", "equipment.create", "assignment.create", "rental.create"]);
  const granted = new Set((permission.data ?? []).map((row: any) => String(row.permission_code)));
  if (permission.error || !granted.has("settings.update")) return out(403, { success: false, code: "FORBIDDEN" });
  const tenant = String(actor.data.company_id);
  const body = await request.json().catch(() => null) as Json | null;
  if (!body || Object.keys(body).length !== 2 || body.scenarioKey !== KEY || body.profileVersion !== PROFILE) return out(400, { success: false, code: "VALIDATION_REJECTED" });
  const resolved = await service.schema("erp").rpc("resolve_uat_deur_turnover_domain_references", { command: { companyId: tenant, scenarioKey: KEY, profileVersion: PROFILE } });
  if (resolved.error || !(resolved.data as Json)?.success) return out(409, { success: false, code: `UAT_REFERENCE_UNAVAILABLE:${String((resolved.data as Json)?.code ?? "UPSTREAM")}`, reference: { rowFound: false, status: resolved.error ? "UPSTREAM_UNAVAILABLE" : "NO_ACTIVE_ROW" } });
  const resolvedReferences = resolved.data as Json;
  const claimed = await service.schema("erp").rpc("claim_uat_deur_turnover_domain_scenario", { command: { companyId: tenant, scenarioKey: KEY, profileVersion: PROFILE, references: resolvedReferences } });
  if (claimed.error || !(claimed.data as Json)?.success) return out(409, { success: false, code: (claimed.data as Json)?.code ?? "SCENARIO_CLAIM_FAILED" });
  const scenario = (claimed.data as Json).scenario as Json;
  const ids = { projectId: String(scenario.projectId), customerId: String(scenario.customerId), rentalId: String(scenario.rentalId), lineId: String(scenario.lineId), equipmentId: String(scenario.equipmentId), assignmentId: String(scenario.assignmentId), primaryOperatorId: String(scenario.primaryOperatorId), relieverOperatorId: String(scenario.relieverOperatorId) };
  if ((claimed.data as Json).state === "DOMAIN_READY") return out(200, { success: true, result: "REUSED", scenarioKey: KEY, profileVersion: PROFILE, ...ids });
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const cmd = (id: string, action: string) => ({ commandId: `UAT-TURNOVER-${action}-${id}`, idempotencyKey: `uat-turnover:${action}:${id}` });
  await stage("CUSTOMER", () => canonical(client, "command_create_customer", { ...cmd(ids.customerId, "CUSTOMER"), customerId: ids.customerId, customerCode: "UAT-TURNOVER-CUSTOMER-001", name: "Synthetic UAT Turnover Customer 001" }));
  await stage("PROJECT", () => canonical(client, "command_create_project", { ...cmd(ids.projectId, "PROJECT"), projectId: ids.projectId, projectCode: "UAT-TURNOVER-SITE-001", name: "Synthetic UAT Turnover Site 001", customerId: ids.customerId, location: "Isolated UAT" }));
  await stage("PRIMARY_OPERATOR", () => canonical(client, "command_create_operator", { ...cmd(ids.primaryOperatorId, "PRIMARY"), operatorId: ids.primaryOperatorId, name: "Synthetic UAT Turnover Primary 001", certificationType: "Heavy Machinery", joinedDate: WORK_DATE }));
  await stage("RELIEVER_OPERATOR", () => canonical(client, "command_create_operator", { ...cmd(ids.relieverOperatorId, "RELIEVER"), operatorId: ids.relieverOperatorId, name: "Synthetic UAT Turnover Reliever 001", certificationType: "Heavy Machinery", joinedDate: WORK_DATE }));
  const costReference = { data: { id: resolvedReferences.costCodeId } };
  const activityReference = { data: { id: resolvedReferences.activityCodeId } };
  const workReference = { data: { id: resolvedReferences.workDescriptionId } };
  await stage("EQUIPMENT", () => canonical(client, "command_create_equipment", { ...cmd(ids.equipmentId, "EQUIPMENT"), equipmentId: ids.equipmentId, assetNo: "UAT-TURNOVER-EQ-001", equipmentName: "Synthetic UAT Turnover Equipment 001", maintenanceType: "Engine Hours", costCodeId: costReference.data.id, currentReading: 0, remarks: "Synthetic isolated-UAT turnover certification equipment." }));
  await stage("ASSIGNMENT", () => canonical(client, "command_create_assignment", { ...cmd(ids.assignmentId, "ASSIGNMENT"), assignmentId: ids.assignmentId, equipmentId: ids.equipmentId, operatorId: ids.primaryOperatorId, projectId: ids.projectId, assignedDate: WORK_DATE, expectedReturn: WORK_DATE, remarks: "Synthetic isolated-UAT turnover certification assignment." }));
  await stage("RENTAL", () => canonical(client, "command_create_reserved_rental", { ...cmd(ids.rentalId, "RENTAL"), rentalId: ids.rentalId, rentalNumber: "UAT-TURNOVER-20260831", customerId: ids.customerId, projectId: ids.projectId, dateOut: WORK_DATE, expectedReturn: WORK_DATE, rentalType: "Operated Rental", lines: [{ id: ids.lineId, equipmentId: ids.equipmentId, assignmentId: ids.assignmentId, operatorId: ids.primaryOperatorId }] }));
  await stage("PREPARE", () => canonical(client, "command_prepare_reserved_rental_aggregate", { ...cmd(ids.rentalId, "PREPARE"), expectedRentalVersion: 1, rentalId: ids.rentalId, lines: [{ lineId: ids.lineId, commercialTerms: { billingMethod: "Per Hour", unitRate: 1000, minimumBillableHours: 0, overtimeRate: 0, standbyRate: 0, mobilizationFee: 0, demobilizationFee: 0, fuelCharge: 0, operatorIncluded: true, operatorRate: 0, taxRate: 0, withholdingTax: 0, contractAmount: 0, currency: "PHP" }, costCodeId: costReference.data.id, activityCodeId: activityReference.data.id, workDescriptionId: workReference.data.id, operationalRemarks: "Synthetic isolated-UAT DEUR turnover runtime certification.", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: WORK_DATE }, shiftWindows: [], workDate: WORK_DATE, meterRequirement: "hourMeter" }] }));
  await stage("RELEASE", () => canonical(client, "command_release_rental", { ...cmd(ids.rentalId, "RELEASE"), rentalId: ids.rentalId, expectedVersion: 2 }));
  await stage("ACTIVATE", () => canonical(client, "command_activate_rental", { ...cmd(ids.rentalId, "ACTIVATE"), rentalId: ids.rentalId, expectedVersion: 3 }));
  await service.schema("erp").rpc("complete_uat_deur_turnover_domain_scenario", { command: { companyId: tenant, scenarioKey: KEY } });
  return out(200, { success: true, result: "DOMAIN_READY", scenarioKey: KEY, profileVersion: PROFILE, ...ids });
}

export async function inspectUatDeurTurnoverDomain(request: Request, env: GroupedReviewWorkerEnvironment): Promise<SafeResult> {
  if (!env.ENABLE_UAT_SYNTHETIC_PROVISIONER || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return out(503, { success: false, code: "UAT_PROVISIONER_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]; if (!token) return out(401, { success: false, code: "UNAUTHENTICATED" });
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const identity = await service.auth.getUser(token); if (identity.error || !identity.data.user) return out(401, { success: false, code: "UNAUTHENTICATED" });
  const actor = await service.schema("erp").from("users").select("company_id,status").eq("id", identity.data.user.id).eq("status", "active").maybeSingle(); if (actor.error || !actor.data) return out(403, { success: false, code: "FORBIDDEN" });
  const body = await request.json().catch(() => null) as Json | null; if (!body || Object.keys(body).length !== 2 || body.scenarioKey !== KEY || body.profileVersion !== PROFILE) return out(400, { success: false, code: "VALIDATION_REJECTED" });
  const read = await service.schema("erp").rpc("inspect_uat_deur_turnover_domain_scenario", { command: { companyId: actor.data.company_id, scenarioKey: KEY, profileVersion: PROFILE } }); if (read.error) return out(503, { success: false, code: "READ_FAILED" }); return out(200, read.data as Json);
}
