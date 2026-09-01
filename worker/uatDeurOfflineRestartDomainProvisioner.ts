import { createClient } from '@supabase/supabase-js';
import type { GroupedReviewWorkerEnvironment } from './configuration';

type Json = Record<string, unknown>;
const KEY = 'DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01';
const PROFILE = 'UAT_DEUR_OFFLINE_RESTART_RUNTIME_V1';
const DATE = '2026-09-01';
const out = (status: number, body: Json) => ({ status, body });
const fixed = (body: unknown) => Boolean(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body as Json).length === 2 && (body as Json).scenarioKey === KEY && (body as Json).profileVersion === PROFILE);

async function refs(service: any, tenant: string) {
  const r = await service.schema('erp').rpc('resolve_uat_deur_offline_restart_runtime_references', { command: { companyId: tenant, scenarioKey: KEY, profileVersion: PROFILE } });
  const data = r.data as Json | null;
  return { error: Boolean(r.error || !data), data, ready: data?.referencesReady === true };
}
async function canonical(client: any, stage: string, name: string, command: Json) {
  const r = await client.schema('erp').rpc(name, { command });
  if (r.error || (r.data as Json)?.success !== true) throw new Error(`${stage}:${String((r.data as Json)?.code ?? 'CANONICAL_COMMAND_FAILED')}`);
}
function safeClaimFailure(claim: { data: unknown; error: unknown }) {
  const data = claim.data as Json | null;
  const error = claim.error as { code?: unknown } | null;
  const claimCode = typeof data?.code === 'string' ? data.code : typeof error?.code === 'string' ? error.code : 'SCENARIO_CLAIM_FAILED';
  return { success: false, code: 'UAT_OFFLINE_RESTART_SCENARIO_FAILED', failedStage: 'CLAIM', failedCode: claimCode, claimState: typeof data?.state === 'string' ? data.state : null, scenarioExists: data?.scenario !== undefined, profileMatches: claimCode !== 'SCENARIO_PROFILE_MISMATCH', resumeEligible: data?.state === 'PROVISIONING' };
}
async function actor(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (!env.ENABLE_UAT_SYNTHETIC_PROVISIONER || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token);
  if (identity.error || !identity.data.user) return null;
  const user = await service.schema('erp').from('users').select('company_id,status').eq('id', identity.data.user.id).eq('status', 'active').maybeSingle();
  const permission = await service.schema('erp').from('effective_user_permissions').select('permission_code').eq('user_id', identity.data.user.id).eq('permission_code', 'settings.update').maybeSingle();
  if (user.error || !user.data || permission.error || !permission.data) return null;
  return { service, token, tenant: String(user.data.company_id) };
}
async function inspect(service: any, tenant: string) {
  const r = await service.schema('erp').rpc('inspect_uat_deur_offline_restart_runtime_scenario', { command: { companyId: tenant, scenarioKey: KEY, profileVersion: PROFILE } });
  return r.error ? out(503, { success: false, code: 'READ_FAILED' }) : out(200, r.data as Json);
}

export async function provisionUatDeurOfflineRestartDomain(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (!fixed(await request.json().catch(() => null))) return out(400, { success: false, code: 'VALIDATION_REJECTED' });
  const authenticated = await actor(request, env);
  if (!authenticated) return out(401, { success: false, code: 'UNAUTHENTICATED' });
  const reference = await refs(authenticated.service, authenticated.tenant);
  if (reference.error || !reference.ready) return out(409, { success: false, code: 'UAT_REFERENCE_UNAVAILABLE' });
  const values = reference.data!;
  const claim = await authenticated.service.schema('erp').rpc('claim_uat_deur_offline_restart_runtime_scenario', { command: { companyId: authenticated.tenant, scenarioKey: KEY, profileVersion: PROFILE, references: { costCodeId: values.costCodeId, activityCodeId: values.activityCodeId, workDescriptionId: values.workDescriptionId } } });
  if (claim.error || (claim.data as Json)?.success !== true) return out(409, safeClaimFailure(claim));
  const scenario = (claim.data as Json).scenario as Json;
  if ((claim.data as Json).state === 'DOMAIN_READY') return inspect(authenticated.service, authenticated.tenant);
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${authenticated.token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const command = (stage: string, entity: string) => ({ commandId: `UAT-OFFLINE-RESTART-${stage}-${scenario[`${entity}Id`]}`, idempotencyKey: `uat-offline-restart:${stage.toLowerCase()}:${scenario[`${entity}Id`]}` });
  try {
    await canonical(client, 'CUSTOMER', 'command_create_customer', { ...command('CUSTOMER', 'customer'), customerId: scenario.customerId, customerCode: 'UAT-OFFLINE-RESTART-CUSTOMER-001', name: 'Synthetic UAT Offline Restart Customer 001' });
    await canonical(client, 'PROJECT', 'command_create_project', { ...command('PROJECT', 'project'), projectId: scenario.projectId, projectCode: 'UAT-OFFLINE-RESTART-SITE-001', name: 'Synthetic UAT Offline Restart Certification Site 001', customerId: scenario.customerId, location: 'Isolated UAT' });
    await canonical(client, 'OPERATOR', 'command_create_operator', { ...command('OPERATOR', 'operator'), operatorId: scenario.operatorId, name: 'Synthetic UAT Offline Restart Operator 001', certificationType: 'Heavy Machinery', joinedDate: DATE });
    await canonical(client, 'EQUIPMENT', 'command_create_equipment', { ...command('EQUIPMENT', 'equipment'), equipmentId: scenario.equipmentId, assetNo: 'UAT-OFFLINE-RESTART-EQ-001', equipmentName: 'Synthetic UAT Offline Restart Equipment 001', maintenanceType: 'Engine Hours', costCodeId: values.costCodeId, currentReading: 0, remarks: 'Synthetic isolated-UAT offline restart certification equipment.' });
    await canonical(client, 'ASSIGNMENT', 'command_create_assignment', { ...command('ASSIGNMENT', 'assignment'), assignmentId: scenario.assignmentId, equipmentId: scenario.equipmentId, operatorId: scenario.operatorId, projectId: scenario.projectId, activityCodeId: values.activityCodeId, assignedDate: DATE, expectedReturn: DATE, remarks: 'Synthetic offline restart certification assignment.' });
    await canonical(client, 'RENTAL', 'command_create_reserved_rental', { ...command('RENTAL', 'rental'), rentalId: scenario.rentalId, rentalNumber: 'UAT-OFFLINE-RESTART-20260901', customerId: scenario.customerId, projectId: scenario.projectId, dateOut: DATE, expectedReturn: DATE, rentalType: 'Operated Rental', lines: [{ id: scenario.lineId, equipmentId: scenario.equipmentId, assignmentId: scenario.assignmentId, operatorId: scenario.operatorId }] });
    await canonical(client, 'PREPARE', 'command_prepare_reserved_rental_aggregate', { ...command('PREPARE', 'rental'), expectedRentalVersion: 1, rentalId: scenario.rentalId, lines: [{ lineId: scenario.lineId, commercialTerms: { billingMethod: 'Per Hour', unitRate: 1000, minimumBillableHours: 0, overtimeRate: 0, standbyRate: 0, mobilizationFee: 0, demobilizationFee: 0, fuelCharge: 0, operatorIncluded: true, operatorRate: 0, taxRate: 0, withholdingTax: 0, contractAmount: 0, currency: 'PHP' }, costCodeId: values.costCodeId, activityCodeId: values.activityCodeId, workDescriptionId: values.workDescriptionId, operationalRemarks: 'Synthetic isolated-UAT offline restart runtime certification.', deurPolicy: { frequency: 'PER_WORKDAY', effectiveFrom: DATE }, shiftWindows: [], workDate: DATE, meterRequirement: 'hourMeter' }] });
    await canonical(client, 'RELEASE', 'command_release_rental', { ...command('RELEASE', 'rental'), rentalId: scenario.rentalId, expectedVersion: 2 });
    await canonical(client, 'ACTIVATE', 'command_activate_rental', { ...command('ACTIVATE', 'rental'), rentalId: scenario.rentalId, expectedVersion: 3 });
    await authenticated.service.schema('erp').rpc('complete_uat_deur_offline_restart_runtime_scenario', { command: { companyId: authenticated.tenant, scenarioKey: KEY } });
    return inspect(authenticated.service, authenticated.tenant);
  } catch (error) {
    const [failedStage, failedCode] = (error instanceof Error ? error.message : 'UNKNOWN').split(':', 2);
    return out(409, { success: false, code: 'UAT_OFFLINE_RESTART_SCENARIO_FAILED', failedStage, failedCode });
  }
}
export async function inspectUatDeurOfflineRestartDomain(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (!fixed(await request.json().catch(() => null))) return out(400, { success: false, code: 'VALIDATION_REJECTED' });
  const authenticated = await actor(request, env);
  return authenticated ? inspect(authenticated.service, authenticated.tenant) : out(401, { success: false, code: 'UNAUTHENTICATED' });
}
