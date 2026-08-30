import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type SafeResult = { status: number; body: Record<string, unknown> };
type Row = Record<string, any>;
const result = (status: number, body: Record<string, unknown>): SafeResult => ({ status, body: { inspectionImplementationVersion: "multi-operator-linkage-work-rpc-v3", ...body } });
const safeErrorClass = (error: any): string => {
  const raw = error?.status ?? error?.code;
  const status = typeof raw === "string" && /^[0-9]+$/.test(raw) ? Number(raw) : Number(raw);
  if (status === 404) return "NOT_FOUND";
  if (status === 401 || status === 403) return "AUTHORIZATION_FAILED";
  if (status === 409) return "CONFLICT";
  if (status === 42702) return "AMBIGUOUS_COLUMN";
  if (status === 42883) return "FUNCTION_NOT_FOUND";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "READ_FAILED";
};
const scenarioKey = "MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29";
const profileVersion = "UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1";
const operatorIds = ["e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876", "cac542f6-2d18-4275-8c26-0728d858c912", "584df24a-c104-4001-b175-c141903f12d5"];
const lineIds = ["22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2", "d1df121a-94f2-47e3-a153-3e47e1218878", "aeafa42d-97dd-40a5-bca7-8ed36e495153"];

export async function inspectUatMultiOperatorLinkage(request: Request, environment: GroupedReviewWorkerEnvironment): Promise<SafeResult> {
  if (environment.ENABLE_UAT_SYNTHETIC_PROVISIONER !== "true" || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return result(503, { success: false, code: "UAT_PROVISIONER_DISABLED" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return result(401, { success: false, code: "UNAUTHENTICATED" });
  const service = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) return result(401, { success: false, code: "UNAUTHENTICATED" });
  const actorId = auth.data.user.id;
  const [permission, admin, appUser] = await Promise.all([
    service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id", actorId).eq("permission_code", "settings.update").maybeSingle(),
    service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id", actorId).eq("app_roles.code", "system-administrator").eq("app_roles.active", true).is("app_roles.deprecated_at", null).maybeSingle(),
    service.schema("erp").from("users").select("company_id,status").eq("id", actorId).maybeSingle(),
  ]);
  if (permission.error || !permission.data || admin.error || !admin.data || appUser.error || !appUser.data || appUser.data.status !== "active") return result(403, { success: false, code: "FORBIDDEN" });
  const companyId = appUser.data.company_id as string;
  const body = await request.json().catch(() => null) as Row | null;
  if (!body || body.scenarioKey !== scenarioKey || body.profileVersion !== profileVersion || JSON.stringify(body.expectedOperatorIds) !== JSON.stringify(operatorIds) || JSON.stringify(body.expectedRentalEquipmentLineIds) !== JSON.stringify(lineIds) || Object.keys(body).length !== 4) return result(400, { success: false, code: "VALIDATION_REJECTED" });
  const tenant = await service.schema("erp").rpc("get_isolated_uat_tenant_metadata", { target_tenant: companyId });
  if (tenant.error || !tenant.data?.length) return result(403, { success: false, code: "UAT_TENANT_REQUIRED" });
  const scenario = await service.schema("erp").rpc("inspect_isolated_uat_multi_equipment_scenario", { target_tenant: companyId, target_scenario: scenarioKey });
  if (scenario.error || !scenario.data) return result(503, { success: false, code: "INSPECTION_UNAVAILABLE", phase: "SCENARIO_INSPECTION", operation: "inspect_isolated_uat_multi_equipment_scenario", safeResultCode: safeErrorClass(scenario.error) });
  const [upstream, userLinkage, workOwnership] = await Promise.all([
    service.schema("erp").rpc("inspect_isolated_uat_upstream_replay_lineage", { command: { companyId, scenarioKey } }),
    service.schema("erp").rpc("inspect_isolated_uat_multi_operator_user_linkage", { command: { companyId, scenarioKey, profileVersion, operatorIds } }),
    service.schema("erp").rpc("inspect_isolated_uat_multi_operator_work_ownership", { command: { companyId, scenarioKey, profileVersion, operatorIds, lineIds } }),
  ]);
  if (upstream.error || userLinkage.error || workOwnership.error) return result(503, { success: false, code: "READ_FAILED", phase: "OPERATOR_LINKAGE_READ", operation: upstream.error ? "inspect_isolated_uat_upstream_replay_lineage" : userLinkage.error ? "users" : "rental_equipment_lines", safeResultCode: safeErrorClass(upstream.error ?? userLinkage.error ?? workOwnership.error) });
  const operators = { data: Array.isArray((upstream.data as Row)?.operators) ? (upstream.data as Row).operators.map((row: Row) => ({ id: row.id, name: row.name, status: row.status, company_id: companyId })) : [], error: null };
  const users = { data: Array.isArray((userLinkage.data as Row)?.operators) ? (userLinkage.data as Row).operators.filter((row: Row) => row.linkedApplicationUserCount === 1).map((row: Row) => ({ id: row.applicationUserId, username: row.username, status: row.status, operator_id: row.operatorId, company_id: row.companyId })) : [], error: userLinkage.data?.success === false ? userLinkage.data : null };
  const lines = { data: Array.isArray((workOwnership.data as Row)?.workItems) ? (workOwnership.data as Row).workItems.map((row: Row) => ({ id: row.rentalEquipmentLineId, rental_id: row.rentalId, equipment_id: row.equipmentId, assignment_id: row.assignmentId, operator_id: row.operatorId, company_id: companyId, status: row.lineStatus })) : [], error: workOwnership.data?.success === false ? workOwnership.data : null };
  const authUsers = new Map<string, Row>();
  for (const user of users.data ?? []) {
    const remote = await service.auth.admin.getUserById(String(user.id));
    if (!remote.error && remote.data.user) authUsers.set(String(user.id), remote.data.user);
  }
  const workByOperator = new Map<string, Row[]>();
  for (const line of lines.data ?? []) { const list = workByOperator.get(String(line.operator_id)) ?? []; list.push(line); workByOperator.set(String(line.operator_id), list); }
  const operatorProjection = operatorIds.map((operatorId, index) => {
    const operator = (operators.data ?? []).find((row: Row) => String(row.id) === operatorId);
    const linked = (users.data ?? []).filter((row: Row) => String(row.operator_id) === operatorId);
    const authMatches = linked.map((user: Row) => authUsers.get(String(user.id))).filter(Boolean);
    const work = workByOperator.get(operatorId) ?? [];
    let classification = "READ_FAILED";
    if (!operator) classification = "READ_FAILED";
    else if (operator.status !== "Active") classification = "INACTIVE_OPERATOR";
    else if (linked.length === 0) classification = "NO_LINKED_USER";
    else if (linked.length > 1) classification = "MULTIPLE_LINKED_USERS";
    else if (linked[0].status !== "active") classification = "INACTIVE_APPLICATION_USER";
    else if (linked[0].company_id !== companyId) classification = "TENANT_MISMATCH";
    else if (authMatches.length !== 1) classification = "AUTH_IDENTITY_MISSING";
    else classification = "LOGIN_READY";
    const expectedLineId = lineIds[index];
    return { operatorId, operatorDisplayName: operator?.name ?? null, operatorStatus: operator?.status ?? null, operatorCompanyId: operator?.company_id ?? null, linkedApplicationUserCount: linked.length, ...(linked.length === 1 ? { applicationUserId: linked[0].id, loginName: linked[0].username, email: null, applicationUserActive: linked[0].status === "active", applicationUserCompanyId: linked[0].company_id } : {}), authIdentityPresent: authMatches.length === 1, linkageClassification: classification, eligibleScenarioWorkCount: work.length, authorizedRentalIds: work.map((row) => row.rental_id), authorizedRentalEquipmentLineIds: work.map((row) => row.id), equipmentIds: work.map((row) => row.equipment_id), assignmentIds: work.map((row) => row.assignment_id), expectedLineId, ownershipMatch: work.length === 1 && String(work[0].id) === expectedLineId && String(work[0].operator_id) === operatorId };
  });
  const crossOperatorExposure = operatorProjection.flatMap((item) => item.authorizedRentalEquipmentLineIds.filter((id: string) => id !== item.expectedLineId));
  return result(200, { success: true, scenarioKey, profileVersion, scenarioState: (scenario.data as Row).scenario?.residueState ?? "COMPLETE_CONSISTENT", tenantId: companyId, operators: operatorProjection, crossOperatorExposure, productionChanged: false, mutationPerformed: false });
}
