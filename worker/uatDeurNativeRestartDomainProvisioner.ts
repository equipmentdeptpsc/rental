import { createClient } from '@supabase/supabase-js';
import type { GroupedReviewWorkerEnvironment } from './configuration';

type Json = Record<string, unknown>;
const KEY = 'DEUR-NATIVE-RESTART-RUNTIME-CERT-2026-09-01';
const PROFILE = 'UAT_DEUR_NATIVE_RESTART_RUNTIME_V1';
const DATE = '2026-09-01';
const out = (status: number, body: Json) => ({ status, body });
const fixed = (body: unknown) => Boolean(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body as Json).length === 2 && (body as Json).scenarioKey === KEY && (body as Json).profileVersion === PROFILE);

async function actor(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (!env.ENABLE_UAT_SYNTHETIC_PROVISIONER || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]; if (!token) return null;
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await service.auth.getUser(token); if (identity.error || !identity.data.user) return null;
  const user = await service.schema('erp').from('users').select('company_id,status').eq('id', identity.data.user.id).eq('status', 'active').maybeSingle();
  const permission = await service.schema('erp').from('effective_user_permissions').select('permission_code').eq('user_id', identity.data.user.id).eq('permission_code', 'settings.update').maybeSingle();
  return user.error || !user.data || permission.error || !permission.data ? null : { service, token, tenant: String(user.data.company_id) };
}
async function inspect(service: any, tenant: string) { const result = await service.schema('erp').rpc('inspect_uat_deur_native_restart_runtime_scenario', { command: { companyId: tenant, scenarioKey: KEY, profileVersion: PROFILE } }); return result.error ? out(503, { success: false, code: 'READ_FAILED' }) : out(200, result.data as Json); }
async function canonical(client: any, stage: string, rpc: string, command: Json) { const result = await client.schema('erp').rpc(rpc, { command }); if (result.error || (result.data as Json)?.success !== true) throw new Error(`${stage}:${String((result.data as Json)?.code ?? 'CANONICAL_COMMAND_FAILED')}`); }

export async function provisionUatDeurNativeRestartDomain(request: Request, env: GroupedReviewWorkerEnvironment) {
  if (!fixed(await request.json().catch(() => null))) return out(400, { success: false, code: 'VALIDATION_REJECTED' });
  const authenticated = await actor(request, env); if (!authenticated) return out(401, { success: false, code: 'UNAUTHENTICATED' });
  const references = await authenticated.service.schema('erp').rpc('resolve_uat_deur_native_restart_runtime_references', { command: { companyId: authenticated.tenant, scenarioKey: KEY, profileVersion: PROFILE } });
  const values = references.data as Json | null; if (references.error || !values || values.referencesReady !== true) return out(409, { success: false, code: 'UAT_REFERENCE_UNAVAILABLE' });
  const claim = await authenticated.service.schema('erp').rpc('claim_uat_deur_native_restart_runtime_scenario', { command: { companyId: authenticated.tenant, scenarioKey: KEY, profileVersion: PROFILE, references: { costCodeId: values.costCodeId, activityCodeId: values.activityCodeId, workDescriptionId: values.workDescriptionId } } });
  if (claim.error || (claim.data as Json)?.success !== true) return out(409, { success: false, code: 'UAT_NATIVE_RESTART_SCENARIO_FAILED', failedStage: 'CLAIM', failedCode: String((claim.data as Json | null)?.code ?? 'SCENARIO_CLAIM_FAILED') });
  const response = claim.data as Json; if (response.state === 'DOMAIN_READY') return inspect(authenticated.service, authenticated.tenant);
  const scenario = response.scenario as Json;
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${authenticated.token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const command = (stage: string, entity: string) => ({ commandId: `UAT-NATIVE-RESTART-${stage}-${scenario[`${entity}Id`]}`, idempotencyKey: `uat-native-restart:${stage.toLowerCase()}:${scenario[`${entity}Id`]}` });
  try {
    await canonical(client, 'CUSTOMER', 'command_create_customer', { ...command('CUSTOMER', 'customer'), customerId: scenario.customerId, customerCode: 'UAT-NATIVE-RESTART-CUSTOMER-001', name: 'Synthetic UAT Native Restart Customer 001' });
    await canonical(client, 'PROJECT', 'command_create_project', { ...command('PROJECT', 'project'), projectId: scenario.projectId, projectCode: 'UAT-NATIVE-RESTART-SITE-001', name: 'Synthetic UAT Native Restart Project 001', customerId: scenario.customerId, location: 'Isolated UAT' });
    await canonical(client, 'OPERATOR', 'command_create_operator', { ...command('OPERATOR', 'operator'), operatorId: scenario.operatorId, name: 'Synthetic UAT Native Restart Operator 001', certificationType: 'Heavy Machinery', joinedDate: DATE });
    await canonical(client, 'EQUIPMENT', 'command_create_equipment', { ...command('EQUIPMENT', 'equipment'), equipmentId: scenario.equipmentId, assetNo: 'UAT-NATIVE-RESTART-EQ-001', equipmentName: 'Synthetic UAT Native Restart Equipment 001', maintenanceType: 'Engine Hours', costCodeId: values.costCodeId, currentReading: 0, remarks: 'Synthetic isolated-UAT native restart certification equipment.' });
    await canonical(client, 'ASSIGNMENT', 'command_create_assignment', { ...command('ASSIGNMENT', 'assignment'), assignmentId: scenario.assignmentId, equipmentId: scenario.equipmentId, operatorId: scenario.operatorId, projectId: scenario.projectId, activityCodeId: values.activityCodeId, assignedDate: DATE, expectedReturn: DATE, remarks: 'Synthetic native restart certification assignment.' });
    await canonical(client, 'RENTAL', 'command_create_reserved_rental', { ...command('RENTAL', 'rental'), rentalId: scenario.rentalId, rentalNumber: 'UAT-NATIVE-RESTART-20260901', customerId: scenario.customerId, projectId: scenario.projectId, dateOut: DATE, expectedReturn: DATE, rentalType: 'Operated Rental', lines: [{ id: scenario.lineId, equipmentId: scenario.equipmentId, assignmentId: scenario.assignmentId, operatorId: scenario.operatorId }] });
    await canonical(client, 'PREPARE', 'command_prepare_reserved_rental_aggregate', { ...command('PREPARE', 'rental'), expectedRentalVersion: 1, rentalId: scenario.rentalId, lines: [{ lineId: scenario.lineId, commercialTerms: { billingMethod: 'Per Hour', unitRate: 1000, minimumBillableHours: 0, overtimeRate: 0, standbyRate: 0, mobilizationFee: 0, demobilizationFee: 0, fuelCharge: 0, operatorIncluded: true, operatorRate: 0, taxRate: 0, withholdingTax: 0, contractAmount: 0, currency: 'PHP' }, costCodeId: values.costCodeId, activityCodeId: values.activityCodeId, workDescriptionId: values.workDescriptionId, operationalRemarks: 'Synthetic isolated-UAT native restart runtime certification.', deurPolicy: { frequency: 'PER_WORKDAY', effectiveFrom: DATE }, shiftWindows: [], workDate: DATE, meterRequirement: 'hourMeter' }] });
    await canonical(client, 'RELEASE', 'command_release_rental', { ...command('RELEASE', 'rental'), rentalId: scenario.rentalId, expectedVersion: 2 });
    await canonical(client, 'ACTIVATE', 'command_activate_rental', { ...command('ACTIVATE', 'rental'), rentalId: scenario.rentalId, expectedVersion: 3 });
    const complete = await authenticated.service.schema('erp').rpc('complete_uat_deur_native_restart_runtime_scenario', { command: { companyId: authenticated.tenant, scenarioKey: KEY } });
    if (complete.error || (complete.data as Json)?.success !== true) return out(409, { success: false, code: 'UAT_NATIVE_RESTART_SCENARIO_FAILED', failedStage: 'COMPLETE', failedCode: String((complete.data as Json | null)?.code ?? 'SCENARIO_COMPLETION_FAILED') });
    return inspect(authenticated.service, authenticated.tenant);
  } catch (error) { const [failedStage, failedCode] = (error instanceof Error ? error.message : 'UNKNOWN').split(':', 2); return out(409, { success: false, code: 'UAT_NATIVE_RESTART_SCENARIO_FAILED', failedStage, failedCode }); }
}
export async function inspectUatDeurNativeRestartDomain(request: Request, env: GroupedReviewWorkerEnvironment) { if (!fixed(await request.json().catch(() => null))) return out(400, { success: false, code: 'VALIDATION_REJECTED' }); const authenticated = await actor(request, env); return authenticated ? inspect(authenticated.service, authenticated.tenant) : out(401, { success: false, code: 'UNAUTHENTICATED' }); }
