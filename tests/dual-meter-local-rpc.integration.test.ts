import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";

// This is deliberately opt-in: it mutates only a reset local Supabase database.
const config = readSupabasePhaseC2TestConfiguration();
const local = config.url ? ["localhost", "127.0.0.1"].includes(new URL(config.url).hostname) : false;
const enabled = config.enabled && local && process.env.RUN_DUAL_METER_LOCAL_RPC === "true";
const container = process.env.DUAL_METER_LOCAL_DB_CONTAINER ?? "";
const suffix = randomBytes(5).toString("hex").toUpperCase();
const tenant = `TENANT-UAT-DUAL-METER-${suffix}`;
const phase = (name: string) => console.info(`[dual-meter-local] ${name}`);
async function boundedRpc<T>(name: string, request: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${Date.now() - startedAt}ms during ${name}.`)), 15_000); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function waitForLocalAuth(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/auth/v1/health`);
      if (response.ok) return;
    } catch { /* local containers may still be restarting after reset */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local auth did not become ready within 15000ms during fixture setup.");
}
const ids = (policy: string) => ({
  operator: `OPR-DM-${suffix}-${policy}`, customer: `CUST-DM-${suffix}-${policy}`,
  project: `PRJ-DM-${suffix}-${policy}`, equipment: `EQP-DM-${suffix}-${policy}`,
  assignment: `ASN-DM-${suffix}-${policy}`, rental: `RENT-DM-${suffix}-${policy}`,
  line: `LINE-DM-${suffix}-${policy}`, deur: `DEUR-DM-${suffix}-${policy}`,
});
const policies = ["none", "hourMeter", "odometer", "both"] as const;

describe.skipIf(!enabled)("local dual-meter authoritative RPC certification", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(config) : undefined;
  const password = `DualMeter-${randomBytes(18).toString("base64url")}`;
  const email = `dual-meter-${suffix.toLowerCase()}@example.invalid`;
  let userId = "";
  const owner = (sql: string) => {
    if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(container)) throw new Error("Verified local Supabase DB container is required.");
    const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout;
  };
  const value = (sql: string) => JSON.parse(owner(`\\pset tuples_only on
${sql}`).trim());

  beforeAll(async () => {
    phase("PHASE 1 fixture setup");
    assertSupabaseFixtureMutationAllowed(config, [tenant]);
    await waitForLocalAuth(config.url!);
    const created = await harness!.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Unable to create local fixture identity.");
    userId = created.data.user.id;
    const rows = policies.map((policy) => {
      const x = ids(policy);
      return `
        INSERT INTO erp.customers(id,customer_code,name,email,active,company_id) VALUES('${x.customer}','DM-${suffix}-${policy}','Customer ${policy}','customer-${policy}@example.invalid',true,'${tenant}');
        INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('${x.project}','DM-${suffix}-${policy}','Project ${policy}','${x.customer}','${tenant}');
        INSERT INTO erp.operators(id,name,status,company_id) VALUES('${x.operator}','Operator ${policy}','Active','${tenant}');
        INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES('${x.equipment}','DM-${suffix}-${policy}','Equipment ${policy}','None','${tenant}');
        INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES('${x.assignment}','${x.equipment}','${x.operator}','${x.project}',current_date-2,current_date-1,'Active','${tenant}');
        INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,customer_review_name_snapshot,customer_review_email_snapshot,company_id) VALUES('${x.rental}','${policy}-${suffix}','${x.customer}','${x.project}','Customer ${policy}','Project ${policy}',current_date,'Operated Rental','Released','Customer ${policy}','customer-${policy.toLowerCase()}@example.invalid','${tenant}');
        INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,commercial_snapshot_required,company_id) VALUES('${x.line}','${x.rental}','${x.equipment}','${x.assignment}','${x.operator}','Released',jsonb_build_object('deurExpectationSnapshot',jsonb_build_object('rentalEquipmentLineId','${x.line}','rentalId','${x.rental}','equipmentId','${x.equipment}','assignmentId','${x.assignment}','operatorId','${x.operator}','projectId','${x.project}','customerId','${x.customer}','policy',jsonb_build_object('frequency','ON_DEMAND'),'shiftWindows','[]'::jsonb,'workDescription',jsonb_build_object('id','WORK-DM','code','DM','name','Local certification','requiresRemarks',false),'workDateRule','RENTAL_DATE_OUT','workDate',current_date::text,'meterRequirement','${policy}','fuelEvidenceRequired',false,'billingMethod','Per Hour','operationalMetadata','{}'::jsonb,'sourceFingerprint','PENDING')),true,'${tenant}');
        INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at) VALUES('SNAP-DM-${suffix}-${policy}','${x.rental}','${x.line}','Per Hour',100,true,'PHP',clock_timestamp());
        UPDATE erp.rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(id)),true) WHERE id='${x.line}';`;
    }).join("\n");
    owner(`BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','DM-${suffix}','Dual meter local certification','test');
      INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-DM-${suffix}','dual-meter-${suffix}','Dual Meter Certification');
      ${rows}
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES('${userId}'::uuid,'${email}','Dual meter operator','active','${ids("none").operator}','${tenant}');
      INSERT INTO erp.role_permissions(role_id,permission_id) SELECT 'ROLE-DM-${suffix}',id FROM erp.app_permissions WHERE code IN ('deur.create','deur.review');
      INSERT INTO erp.user_roles(user_id,role_id) VALUES('${userId}'::uuid,'ROLE-DM-${suffix}');
      -- The same authenticated identity is deliberately linked to the first fixture only.
      UPDATE erp.users SET operator_id='${ids("both").operator}' WHERE id='${userId}'::uuid;
      COMMIT;`);
  }, 60_000);

  it("runs Start, Complete and Submit through local authenticated RPCs for all policies", async () => {
    const actor = createClient(config.url!, config.publishableKey!, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `dual-meter-${suffix}` } });
    phase("PHASE 2 auth");
    const signIn = await boundedRpc("auth.signInWithPassword", () => actor.auth.signInWithPassword({ email, password }));
    expect(signIn.error).toBeNull(); expect(signIn.data.session?.access_token).toBeTruthy();
    for (const policy of policies) {
      const x = ids(policy);
      // Relink the one local identity before each request; this keeps authorization real and deterministic.
      owner(`UPDATE erp.users SET operator_id='${x.operator}' WHERE id='${userId}'::uuid;`);
      const meters = policy === "both" ? { openingHourMeter: "100", openingOdometer: "1000", closingHourMeter: "101.5", closingOdometer: "1014" }
        : policy === "hourMeter" ? { openingHourMeter: "100", closingHourMeter: "101.5" }
        : policy === "odometer" ? { openingOdometer: "1000", closingOdometer: "1014" } : {};
      const base = { rentalId: x.rental, rentalLineId: x.line, equipmentId: x.equipment, assignmentId: x.assignment, operatorId: x.operator, deviceId: `DM-${policy}` };
      const startCommand = { ...base, commandId: randomUUID(), idempotencyKey: randomUUID(), draft: { id: x.deur, shift: "Day", workDate: new Date().toISOString().slice(0, 10), ...meters } };
      phase(`PHASE 3 Start RPC (${policy})`);
      const start = await boundedRpc("command_start_deur_shift", () => actor.schema("erp").rpc("command_start_deur_shift", { command: startCommand }));
      expect(start.error).toBeNull(); expect(start.data).toMatchObject({ success: true, disposition: "ACCEPTED", version: 1 });
      phase(`PHASE 4 Start replay (${policy})`);
      const startReplay = await boundedRpc("command_start_deur_shift replay", () => actor.schema("erp").rpc("command_start_deur_shift", { command: { ...startCommand, commandId: randomUUID() } }));
      expect(startReplay.data).toMatchObject({ success: true, disposition: "REPLAYED" });
      const completeCommand = { ...base, commandId: randomUUID(), idempotencyKey: randomUUID(), deurId: x.deur, expectedVersion: 1, meterRequirement: policy, ...meters };
      phase(`PHASE 5 Complete RPC (${policy})`);
      const complete = await boundedRpc("command_complete_deur_shift", () => actor.schema("erp").rpc("command_complete_deur_shift", { command: completeCommand }));
      expect(complete.error).toBeNull(); expect(complete.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
      phase(`PHASE 6 Complete replay (${policy})`);
      const completeReplay = await boundedRpc("command_complete_deur_shift replay", () => actor.schema("erp").rpc("command_complete_deur_shift", { command: { ...completeCommand, commandId: randomUUID() } }));
      expect(completeReplay.data).toMatchObject({ success: true, disposition: "REPLAYED" });
      phase(`PHASE 7 Submit (${policy})`);
      const submitted = await boundedRpc("command_submit_deur", () => actor.schema("erp").rpc("command_submit_deur", { command: { ...base, commandId: randomUUID(), idempotencyKey: randomUUID(), deurId: x.deur, expectedVersion: (complete.data as { version: number }).version } }));
      expect(submitted.error).toBeNull(); expect(submitted.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
      phase(`PHASE 8 canonical readback (${policy})`);
      const readback = value(`SELECT jsonb_build_object('status',(SELECT status FROM erp.deurs WHERE id='${x.deur}'),'hourOpen',(SELECT opening_hour_meter FROM erp.deurs WHERE id='${x.deur}'),'hourClose',(SELECT closing_hour_meter FROM erp.deurs WHERE id='${x.deur}'),'odoOpen',(SELECT opening_odometer FROM erp.deurs WHERE id='${x.deur}'),'odoClose',(SELECT closing_odometer FROM erp.deurs WHERE id='${x.deur}'),'genericOpen',(SELECT opening_meter FROM erp.deurs WHERE id='${x.deur}'),'genericClose',(SELECT closing_meter FROM erp.deurs WHERE id='${x.deur}'));`);
      expect(readback.status).toBe("Submitted");
      if (policy === "both") expect(readback).toMatchObject({ hourOpen: 100, hourClose: 101.5, odoOpen: 1000, odoClose: 1014, genericOpen: null, genericClose: null });
      if (policy === "hourMeter") expect(readback).toMatchObject({ hourOpen: 100, hourClose: 101.5, odoOpen: null, odoClose: null, genericOpen: 100, genericClose: 101.5 });
      if (policy === "odometer") expect(readback).toMatchObject({ hourOpen: null, hourClose: null, odoOpen: 1000, odoClose: 1014, genericOpen: 1000, genericClose: 1014 });
    }
    const both = ids("both");
    owner(`UPDATE erp.users SET operator_id='${both.operator}' WHERE id='${userId}'::uuid;`);
    console.info("[dual-meter-local] PHASE 9 state", JSON.stringify(value(`SELECT jsonb_build_object('status',(SELECT status FROM erp.deurs WHERE id='${both.deur}'),'submitted',(SELECT submitted_at IS NOT NULL FROM erp.deurs WHERE id='${both.deur}'),'customerActive',(SELECT active FROM erp.customers WHERE id='${both.customer}'),'customerEmail',(SELECT email IS NOT NULL FROM erp.customers WHERE id='${both.customer}'),'equipment',(SELECT count(*) FROM erp.equipment WHERE id='${both.equipment}'),'openStarted',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${both.deur}' AND action='start' AND NOT EXISTS(SELECT 1 FROM erp.deur_events f WHERE f.deur_id=erp.deur_events.deur_id AND f.activity_type=erp.deur_events.activity_type AND f.action='end' AND f.sequence>erp.deur_events.sequence)));`)));
    phase("PHASE 9 customer review snapshot");
    const review = await boundedRpc("command_create_customer_review_request", () => actor.schema("erp").rpc("command_create_customer_review_request", { command: { commandId: randomUUID(), idempotencyKey: randomUUID(), deurId: both.deur, rentalLineId: both.line, revisionId: both.deur } }));
    expect(review.error).toBeNull(); expect(review.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
    phase("PHASE 10 notification projection");
    const projection = value(`SELECT jsonb_build_object('review',(SELECT snapshot FROM erp.customer_review_requests WHERE company_id='${tenant}' AND deur_id='${both.deur}'),'notification',(SELECT jsonb_build_object('type',notification_type,'recipient',recipient_destination,'source',source_aggregate_id) FROM erp.notification_outbox WHERE company_id='${tenant}' ORDER BY created_at DESC LIMIT 1));`);
    expect(projection.review).toMatchObject({ openingHourMeter: 100, closingHourMeter: 101.5, openingOdometer: 1000, closingOdometer: 1014 });
    expect(projection.review).not.toHaveProperty("openingMeter"); expect(projection.review).not.toHaveProperty("closingMeter");
    expect(projection.notification).toBeTruthy();
    phase("PHASE 11 teardown");
    await boundedRpc("auth.signOut", () => actor.auth.signOut());
  }, 120_000);

});
