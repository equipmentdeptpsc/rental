import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { executeParallelCommandRace, type ParallelRaceResult } from "./support/parallelCommandRace";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C4D_LIVE === "true";
const tenant = "TENANT-UAT-C4D-RACES";
const ids = {
  opsA: "7d4d0000-0000-4000-8000-000000000001",
  opsB: "7d4d0000-0000-4000-8000-000000000002",
  financeA: "7d4d0000-0000-4000-8000-000000000003",
  financeB: "7d4d0000-0000-4000-8000-000000000004",
  recoveryA: "7d4d0000-0000-4000-8000-000000000005",
  recoveryB: "7d4d0000-0000-4000-8000-000000000006",
} as const;
type Identity = keyof typeof ids;
const password = `C4D-${randomBytes(24).toString("base64url")}`;
const email = (identity: Identity) => `tenant-uat-c4d-${identity.toLowerCase()}@example.invalid`;

const code = (result: ParallelRaceResult["a"]) =>
  result.error?.code ?? String(result.data?.code ?? result.data?.disposition ?? (result.data?.success ? "ACCEPTED" : "UNKNOWN"));
const accepted = (result: ParallelRaceResult["a"]) => result.error === null && result.data?.success === true;
const assertConcurrent = (race: ParallelRaceResult) => {
  expect(race.deadlock).toBe(false);
  expect(race.overlapped).toBe(true);
  expect(race.releaseSkewMs).toBeLessThan(100);
  expect(race.a.error).toBeNull();
  expect(race.b.error).toBeNull();
};
const expectOneWinner = (race: ParallelRaceResult) => {
  assertConcurrent(race);
  expect([accepted(race.a), accepted(race.b)].filter(Boolean)).toHaveLength(1);
};

describe.skipIf(!enabled)("Phase C4D true parallel concurrency", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  const clients = {} as Record<Identity, SupabaseClient>;
  let opsASecond: SupabaseClient;
  const evidence: Array<{ race: string; a: string; b: string; durationMs: number; deadlock: boolean }> = [];

  const owner = (sql: string) =>
    executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });

  function cleanup() {
    owner(`
      BEGIN;
      DELETE FROM erp.collections WHERE billing_statement_id IN (SELECT id FROM erp.billing_statements WHERE company_id='${tenant}');
      DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
      DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
      DELETE FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}';
      DELETE FROM erp.deur_activity_logs WHERE deur_id LIKE 'UAT-C4D-%';
      DELETE FROM erp.deur_events WHERE company_id='${tenant}';
      DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.audit_log WHERE company_id='${tenant}';
      DELETE FROM erp.billing_statement_lines WHERE company_id='${tenant}';
      DELETE FROM erp.recovery_compensations WHERE company_id='${tenant}';
      DELETE FROM erp.billing_statements WHERE company_id='${tenant}';
      DELETE FROM erp.deurs WHERE company_id='${tenant}';
      DELETE FROM erp.commercial_snapshots WHERE rental_id LIKE 'UAT-C4D-%';
      DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
      DELETE FROM erp.rentals WHERE company_id='${tenant}';
      DELETE FROM erp.assignments WHERE company_id='${tenant}';
      DELETE FROM erp.equipment WHERE company_id='${tenant}';
      DELETE FROM erp.operators WHERE company_id='${tenant}';
      DELETE FROM erp.projects WHERE company_id='${tenant}';
      DELETE FROM erp.customers WHERE company_id='${tenant}';
      DELETE FROM erp.user_roles WHERE user_id IN (${Object.values(ids).map((id) => `'${id}'::uuid`).join(",")});
      DELETE FROM erp.users WHERE company_id='${tenant}';
      DELETE FROM erp.role_permissions WHERE role_id LIKE 'ROLE-UAT-C4D-%';
      DELETE FROM erp.app_roles WHERE id LIKE 'ROLE-UAT-C4D-%';
      DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4D-%';
      DELETE FROM erp.equipment_statuses WHERE id LIKE 'STATUS-UAT-C4D-%';
      DELETE FROM erp.number_sequences WHERE company_id='${tenant}';
      DELETE FROM erp.companies WHERE id='${tenant}';
      COMMIT;
    `);
  }

  function record(name: string, race: ParallelRaceResult) {
    const item = {
      race: name, a: code(race.a), b: code(race.b),
      durationMs: Math.max(race.a.durationMs, race.b.durationMs), deadlock: race.deadlock,
    };
    evidence.push(item);
    console.info("C4D_RACE_EVIDENCE", JSON.stringify({
      ...item,
      overlapped: race.overlapped,
      releaseSkewMs: race.releaseSkewMs,
    }));
  }

  async function rpcRace(
    name: string,
    clientA: SupabaseClient,
    clientB: SupabaseClient,
    rpcA: string,
    commandA: Record<string, unknown>,
    rpcB: string,
    commandB: Record<string, unknown>,
  ) {
    const race = await executeParallelCommandRace({ clientA, clientB, rpcA, rpcB, commandA, commandB });
    record(name, race);
    return race;
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    for (const identity of Object.keys(ids) as Identity[]) {
      const created = await harness!.admin.auth.admin.createUser({
        id: ids[identity], email: email(identity), password, email_confirm: true,
      });
      if (created.error) throw new Error(`C4D Auth provisioning failed for ${identity}: ${created.error.message}`);
    }
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C4D Races','test');
      INSERT INTO erp.operators(id,name,status,company_id)
        SELECT 'UAT-C4D-OP-'||lpad(n::text,2,'0'),'C4D Operator '||n,'Active','${tenant}'
        FROM generate_series(1,30) n;
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
        ('${ids.opsA}'::uuid,'${email("opsA")}','Rental Operations A','active','UAT-C4D-OP-01','${tenant}'),
        ('${ids.opsB}'::uuid,'${email("opsB")}','Rental Operations B','active','UAT-C4D-OP-30','${tenant}'),
        ('${ids.financeA}'::uuid,'${email("financeA")}','Finance A','active',NULL,'${tenant}'),
        ('${ids.financeB}'::uuid,'${email("financeB")}','Finance B','active',NULL,'${tenant}'),
        ('${ids.recoveryA}'::uuid,'${email("recoveryA")}','Recovery A','active',NULL,'${tenant}'),
        ('${ids.recoveryB}'::uuid,'${email("recoveryB")}','Recovery B','active',NULL,'${tenant}');
      INSERT INTO erp.app_roles(id,code,name) VALUES
        ('ROLE-UAT-C4D-OPS','c4d-rental-operations','C4D Rental Operations'),
        ('ROLE-UAT-C4D-FIN','c4d-finance','C4D Finance'),
        ('ROLE-UAT-C4D-REC','c4d-recovery','C4D Recovery');
      INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C4D-RENTAL-MANAGE','rental.manage','Rental Manage'),
        ('PERM-UAT-C4D-RENTAL-RELEASE','rental.release','Rental Release'),
        ('PERM-UAT-C4D-RENTAL-RETURN','rental.return','Rental Return'),
        ('PERM-UAT-C4D-DEUR-CREATE','deur.create','DEUR Create'),
        ('PERM-UAT-C4D-DEUR-REVIEW','deur.review','DEUR Review'),
        ('PERM-UAT-C4D-BILLING-CREATE','billing.create','Billing Create'),
        ('PERM-UAT-C4D-BILLING-UPDATE','billing.update','Billing Update');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4D-OPS',id FROM erp.app_permissions WHERE code IN('rental.manage','rental.release','rental.return','deur.create','deur.review');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4D-FIN',id FROM erp.app_permissions WHERE code IN('billing.create','billing.update');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4D-REC',id FROM erp.app_permissions WHERE code IN('rental.manage','rental.return','billing.update');
      INSERT INTO erp.user_roles(user_id,role_id) VALUES
        ('${ids.opsA}'::uuid,'ROLE-UAT-C4D-OPS'),('${ids.opsB}'::uuid,'ROLE-UAT-C4D-OPS'),
        ('${ids.financeA}'::uuid,'ROLE-UAT-C4D-FIN'),('${ids.financeB}'::uuid,'ROLE-UAT-C4D-FIN'),
        ('${ids.recoveryA}'::uuid,'ROLE-UAT-C4D-REC'),('${ids.recoveryB}'::uuid,'ROLE-UAT-C4D-REC');
      INSERT INTO erp.equipment_statuses(id,code,name) VALUES
        ('STATUS-UAT-C4D-AVAILABLE','Available','Available'),
        ('STATUS-UAT-C4D-ASSIGNED','Assigned','Assigned'),
        ('STATUS-UAT-C4D-RENTED','Rented','Rented');
      INSERT INTO erp.customers(id,customer_code,name,company_id)
        VALUES('UAT-C4D-CUSTOMER','UAT-C4D-CUST','C4D Customer','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C4D-PROJECT','UAT-C4D-PROJ','C4D Project','UAT-C4D-CUSTOMER','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id)
        SELECT 'UAT-C4D-EQ-'||lpad(n::text,2,'0'),'UAT-C4D-EQ-'||lpad(n::text,2,'0'),
          'C4D Equipment '||n,'None','STATUS-UAT-C4D-AVAILABLE','${tenant}' FROM generate_series(1,30) n;
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        SELECT 'UAT-C4D-ASG-'||lpad(n::text,2,'0'),'UAT-C4D-EQ-'||lpad(n::text,2,'0'),
          'UAT-C4D-OP-'||lpad(n::text,2,'0'),
          'UAT-C4D-PROJECT','2026-07-01','2026-08-29','Active','${tenant}' FROM generate_series(1,30) n;

      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,legacy_payload,company_id) VALUES
        ('UAT-C4D-R3','UAT-C4D-R3','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Reserved','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R4','UAT-C4D-R4','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Reserved','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R5','UAT-C4D-R5','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Released','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R6','UAT-C4D-R6','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Active','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R11','UAT-C4D-R11','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Reserved','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R20','UAT-C4D-R20','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Returned','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R21','UAT-C4D-R21','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Returned','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-R22','UAT-C4D-R22','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Returned','{"approvalStatus":"Approved"}','${tenant}'),
        ('UAT-C4D-STANDBY','UAT-C4D-STANDBY','UAT-C4D-CUSTOMER','UAT-C4D-PROJECT','Customer','Project','2026-07-29','Operated Rental','Active','{"approvalStatus":"Approved"}','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id) VALUES
        ('UAT-C4D-L3','UAT-C4D-R3','UAT-C4D-EQ-04','UAT-C4D-ASG-04','UAT-C4D-OP-04','Reserved','${tenant}'),
        ('UAT-C4D-L4','UAT-C4D-R4','UAT-C4D-EQ-05','UAT-C4D-ASG-05','UAT-C4D-OP-05','Reserved','${tenant}'),
        ('UAT-C4D-L5','UAT-C4D-R5','UAT-C4D-EQ-06','UAT-C4D-ASG-06','UAT-C4D-OP-06','Released','${tenant}'),
        ('UAT-C4D-L6','UAT-C4D-R6','UAT-C4D-EQ-07','UAT-C4D-ASG-07','UAT-C4D-OP-07','Active','${tenant}'),
        ('UAT-C4D-L11','UAT-C4D-R11','UAT-C4D-EQ-08','UAT-C4D-ASG-08','UAT-C4D-OP-08','Reserved','${tenant}'),
        ('UAT-C4D-L20','UAT-C4D-R20','UAT-C4D-EQ-20','UAT-C4D-ASG-20','UAT-C4D-OP-20','Returned','${tenant}'),
        ('UAT-C4D-L21','UAT-C4D-R21','UAT-C4D-EQ-21','UAT-C4D-ASG-21','UAT-C4D-OP-21','Returned','${tenant}'),
        ('UAT-C4D-L22','UAT-C4D-R22','UAT-C4D-EQ-22','UAT-C4D-ASG-22','UAT-C4D-OP-22','Returned','${tenant}'),
        ('UAT-C4D-L30','UAT-C4D-STANDBY','UAT-C4D-EQ-30','UAT-C4D-ASG-30','UAT-C4D-OP-30','Active','${tenant}');
      INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,
        mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,captured_at) VALUES
        ('UAT-C4D-S20','UAT-C4D-R20','UAT-C4D-L20','Per Hour',100,0,20,0,0,0,true,0,0,0,'PHP',now()),
        ('UAT-C4D-S21','UAT-C4D-R21','UAT-C4D-L21','Per Hour',100,0,20,0,0,0,true,0,0,0,'PHP',now());
      INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,currency,
        subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,company_id) VALUES
        ('UAT-C4D-BS20-A','UAT-C4D-BS20-A','UAT-C4D-R20','Customer','Project','2026-07-29','2026-07-29','PHP',0,0,0,0,'Draft','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS20-B','UAT-C4D-BS20-B','UAT-C4D-R20','Customer','Project','2026-07-28','2026-07-28','PHP',0,0,0,0,'Draft','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS8','UAT-C4D-BS8','UAT-C4D-R22','Customer','Project','2026-07-29','2026-07-29','PHP',100,0,0,100,'Approved','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS8-2','UAT-C4D-BS8-2','UAT-C4D-R22','Customer','Project','2026-07-27','2026-07-27','PHP',100,0,0,100,'Approved','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS8-3','UAT-C4D-BS8-3','UAT-C4D-R22','Customer','Project','2026-07-26','2026-07-26','PHP',100,0,0,100,'Approved','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS9-NEW','UAT-C4D-BS9-NEW','UAT-C4D-R21','Customer','Project','2026-07-29','2026-07-29','PHP',0,0,0,0,'Draft','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS9-NEW-2','UAT-C4D-BS9-NEW-2','UAT-C4D-R21','Customer','Project','2026-07-27','2026-07-27','PHP',0,0,0,0,'Draft','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS9-NEW-3','UAT-C4D-BS9-NEW-3','UAT-C4D-R21','Customer','Project','2026-07-26','2026-07-26','PHP',0,0,0,0,'Draft','Not Invoiced','C4D','${tenant}'),
        ('UAT-C4D-BS21-OLD','UAT-C4D-BS21-OLD','UAT-C4D-R21','Customer','Project','2026-07-28','2026-07-28','PHP',100,0,0,100,'Approved','Cancelled','C4D','${tenant}'),
        ('UAT-C4D-BS21-OLD-2','UAT-C4D-BS21-OLD-2','UAT-C4D-R21','Customer','Project','2026-07-25','2026-07-25','PHP',100,0,0,100,'Approved','Cancelled','C4D','${tenant}'),
        ('UAT-C4D-BS21-OLD-3','UAT-C4D-BS21-OLD-3','UAT-C4D-R21','Customer','Project','2026-07-24','2026-07-24','PHP',100,0,0,100,'Approved','Cancelled','C4D','${tenant}'),
        ('UAT-C4D-BS10','UAT-C4D-BS10','UAT-C4D-R22','Customer','Project','2026-07-28','2026-07-28','PHP',100,0,0,100,'Approved','Not Invoiced','C4D','${tenant}');
      INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,
        work_date,status,evidence_mode,billing_method_snapshot,total_operating_minutes,total_standby_minutes,billing_locked,billing_statement_id,company_id) VALUES
        ('UAT-C4D-D20','UAT-C4D-D20','UAT-C4D-R20','UAT-C4D-L20','UAT-C4D-EQ-20','UAT-C4D-OP-20','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER','UAT-C4D-S20','2026-07-29','Acknowledged','TIME_TIMELINE','Per Hour',60,30,false,NULL,'${tenant}'),
        ('UAT-C4D-D21','UAT-C4D-D21','UAT-C4D-R21','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-OP-21','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER','UAT-C4D-S21','2026-07-29','Billed','TIME_TIMELINE','Per Hour',60,0,true,'UAT-C4D-BS21-OLD','${tenant}'),
        ('UAT-C4D-D21-2','UAT-C4D-D21-2','UAT-C4D-R21','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-OP-21','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER','UAT-C4D-S21','2026-07-27','Billed','TIME_TIMELINE','Per Hour',60,0,true,'UAT-C4D-BS21-OLD-2','${tenant}'),
        ('UAT-C4D-D21-3','UAT-C4D-D21-3','UAT-C4D-R21','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-OP-21','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER','UAT-C4D-S21','2026-07-26','Billed','TIME_TIMELINE','Per Hour',60,0,true,'UAT-C4D-BS21-OLD-3','${tenant}'),
        ('UAT-C4D-D22-A','UAT-C4D-D22-A','UAT-C4D-R22','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-OP-22','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER',NULL,'2026-07-29','Acknowledged','TIME_TIMELINE',NULL,0,0,false,NULL,'${tenant}'),
        ('UAT-C4D-D22-B','UAT-C4D-D22-B','UAT-C4D-R22','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-OP-22','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER',NULL,'2026-07-28','Acknowledged','TIME_TIMELINE',NULL,0,0,false,NULL,'${tenant}'),
        ('UAT-C4D-D22-C','UAT-C4D-D22-C','UAT-C4D-R22','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-OP-22','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER',NULL,'2026-07-27','Acknowledged','TIME_TIMELINE',NULL,0,0,false,NULL,'${tenant}'),
        ('UAT-C4D-D22-D','UAT-C4D-D22-D','UAT-C4D-R22','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-OP-22','UAT-C4D-PROJECT','UAT-C4D-CUSTOMER',NULL,'2026-07-26','Acknowledged','TIME_TIMELINE',NULL,0,0,false,NULL,'${tenant}');
      INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,
        cost_code_snapshot,billing_method,hours,hourly_rate,amount,vat,withholding_tax,grand_total,company_id) VALUES
        ('UAT-C4D-BL8','UAT-C4D-BS8','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-D22-A','UAT-C4D-OP-22','2026-07-29','Invoice race','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL8-2','UAT-C4D-BS8-2','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-D22-C','UAT-C4D-OP-22','2026-07-27','Invoice race 2','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL8-3','UAT-C4D-BS8-3','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-D22-D','UAT-C4D-OP-22','2026-07-26','Invoice race 3','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL21','UAT-C4D-BS21-OLD','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-D21','UAT-C4D-OP-21','2026-07-28','Consumed','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL21-2','UAT-C4D-BS21-OLD-2','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-D21-2','UAT-C4D-OP-21','2026-07-25','Consumed 2','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL21-3','UAT-C4D-BS21-OLD-3','UAT-C4D-L21','UAT-C4D-EQ-21','UAT-C4D-D21-3','UAT-C4D-OP-21','2026-07-24','Consumed 3','','Per Hour',1,100,100,0,0,100,'${tenant}'),
        ('UAT-C4D-BL10','UAT-C4D-BS10','UAT-C4D-L22','UAT-C4D-EQ-22','UAT-C4D-D22-B','UAT-C4D-OP-22','2026-07-28','Recovery race','','Per Hour',1,100,100,0,0,100,'${tenant}');
      COMMIT;
    `);
    for (const identity of Object.keys(ids) as Identity[]) {
      clients[identity] = createClient(configuration.url!, configuration.publishableKey!, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: `c4d-${identity}` },
      });
      const login = await clients[identity].auth.signInWithPassword({ email: email(identity), password });
      if (login.error) throw new Error(`C4D login failed for ${identity}: ${login.error.message}`);
    }
    opsASecond = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c4d-ops-a-second" },
    });
    const secondLogin = await opsASecond.auth.signInWithPassword({ email: email("opsA"), password });
    if (secondLogin.error) throw secondLogin.error;
  }, 90_000);

  afterAll(async () => {
    await Promise.allSettled([
      ...Object.values(clients).map((client) => client.auth.signOut()),
      opsASecond?.auth.signOut(),
    ]);
    cleanup();
    cleanup();
    for (const id of Object.values(ids)) await harness!.admin.auth.admin.deleteUser(id);
  }, 90_000);

  it("authenticated standby smoke uses normal PostgREST commands", async () => {
    const base = {
      rentalId: "UAT-C4D-STANDBY", rentalLineId: "UAT-C4D-L30", assignmentId: "UAT-C4D-ASG-30",
      equipmentId: "UAT-C4D-EQ-30", operatorId: "UAT-C4D-OP-30", deviceId: "C4D",
    };
    const started = await clients.opsB.schema("erp").rpc("command_start_deur_shift", { command: {
      ...base, commandId: "C4D-SMOKE-START", idempotencyKey: "C4D-SMOKE-START",
      draft: { id: "UAT-C4D-D30", workDate: "2026-07-29", shift: "Day", evidenceMode: "TIME_TIMELINE" },
    } });
    expect(started.error).toBeNull(); expect(started.data.success).toBe(true);
    const visibleDeur = await clients.opsB.schema("erp")
      .from("deurs")
      .select("id,company_id,row_version")
      .eq("id", "UAT-C4D-D30")
      .single();
    expect(visibleDeur.error).toBeNull();
    expect(visibleDeur.data).toMatchObject({ id: "UAT-C4D-D30", company_id: tenant });
    let version = started.data.version as number;
    for (const action of ["START_STANDBY", "START_IDLE", "START_OPERATION"] as const) {
      const result = await clients.opsB.schema("erp").rpc("command_transition_deur_activity", { command: {
        ...base, deurId: "UAT-C4D-D30",
        expectedVersion: version, action, commandId: `C4D-SMOKE-${action}`, idempotencyKey: `C4D-SMOKE-${action}`,
      } });
      expect(result.error).toBeNull(); expect(result.data).toMatchObject({ success: true }); version = result.data.version;
    }
    const stale = await clients.opsB.schema("erp").rpc("command_transition_deur_activity", { command: {
      ...base, deurId: "UAT-C4D-D30",
      expectedVersion: 1, action: "START_IDLE", commandId: "C4D-SMOKE-STALE", idempotencyKey: "C4D-SMOKE-STALE",
    } });
    expect(stale.data.code).toBe("CONFLICT");
    const completed = await clients.opsB.schema("erp").rpc("command_complete_deur_shift", { command: {
      ...base, deurId: "UAT-C4D-D30", expectedVersion: version, meterRequirement: "none",
      commandId: "C4D-SMOKE-COMPLETE", idempotencyKey: "C4D-SMOKE-COMPLETE",
    } });
    expect(completed.error).toBeNull(); expect(completed.data.success).toBe(true);
    const replay = await clients.opsB.schema("erp").rpc("command_complete_deur_shift", { command: {
      ...base, deurId: "UAT-C4D-D30", expectedVersion: version, meterRequirement: "none",
      commandId: "C4D-SMOKE-COMPLETE-RETRY", idempotencyKey: "C4D-SMOKE-COMPLETE",
    } });
    expect(replay.data.disposition).toBe("REPLAYED");
  });

  it("Race 1: same equipment reservation has one winner", async () => {
    const line = (rentalId: string) => [{ id: `${rentalId}-L`, equipmentId: "UAT-C4D-EQ-01", assignmentId: "UAT-C4D-ASG-01", operatorId: "UAT-C4D-OP-01" }];
    const command = (side: string) => ({ commandId: `C4D-R1-${side}`, idempotencyKey: `C4D-R1-${side}`, rentalId: `UAT-C4D-R1-${side}`,
      rentalNumber: `UAT-C4D-R1-${side}`, customerId: "UAT-C4D-CUSTOMER", projectId: "UAT-C4D-PROJECT", dateOut: "2026-07-29",
      rentalType: "Operated Rental", lines: line(`UAT-C4D-R1-${side}`) });
    const race = await rpcRace("same equipment", clients.opsA, clients.opsB, "command_create_reserved_rental", command("A"), "command_create_reserved_rental", command("B"));
    expectOneWinner(race);
    expect([code(race.a), code(race.b)]).toContain("EQUIPMENT_UNAVAILABLE");
    const rows = await clients.opsA.schema("erp").from("rental_equipment_lines").select("id").eq("equipment_id", "UAT-C4D-EQ-01");
    expect(rows.data).toHaveLength(1);
  });

  it.each([1, 2, 3])("Race 2.%i: opposite-order reservation avoids deadlock and partial lines", async (iteration) => {
    const suffix = `R2-${iteration}`;
    const equipment = [`UAT-C4D-EQ-${String(9 + iteration * 2).padStart(2, "0")}`, `UAT-C4D-EQ-${String(10 + iteration * 2).padStart(2, "0")}`];
    const make = (side: string, order: string[]) => ({ commandId: `C4D-${suffix}-${side}`, idempotencyKey: `C4D-${suffix}-${side}`,
      rentalId: `UAT-C4D-${suffix}-${side}`, rentalNumber: `UAT-C4D-${suffix}-${side}`, customerId: "UAT-C4D-CUSTOMER",
      projectId: "UAT-C4D-PROJECT", dateOut: "2026-07-29", rentalType: "Operated Rental",
      lines: order.map((id, index) => { const n=id.at(-2)!+id.at(-1)!; return { id: `UAT-C4D-${suffix}-${side}-L${index}`, equipmentId:id,
        assignmentId:`UAT-C4D-ASG-${n}`, operatorId:`UAT-C4D-OP-${n}` }; }) });
    const race = await rpcRace(`opposite order ${iteration}`, clients.opsA, clients.opsB, "command_create_reserved_rental",
      make("A", equipment), "command_create_reserved_rental", make("B", [...equipment].reverse()));
    expectOneWinner(race);
    const rentals = await clients.opsA.schema("erp").from("rentals").select("id").like("id", `UAT-C4D-${suffix}-%`);
    expect(rentals.data).toHaveLength(1);
    const lines = await clients.opsA.schema("erp").from("rental_equipment_lines").select("id").like("id", `UAT-C4D-${suffix}-%`);
    expect(lines.data).toHaveLength(2);
  });

  it("Race 3: duplicate release changes the rental once", async () => {
    const make = (side: string) => ({ commandId:`C4D-R3-${side}`,idempotencyKey:`C4D-R3-${side}`,rentalId:"UAT-C4D-R3",expectedVersion:1 });
    const race = await rpcRace("duplicate release",clients.opsA,clients.opsB,"command_release_rental",make("A"),"command_release_rental",make("B"));
    expectOneWinner(race); expect([code(race.a),code(race.b)]).toContain("CONFLICT");
  });

  it("Race 4: release versus cancel has one terminal state", async () => {
    const common={rentalId:"UAT-C4D-R4",expectedVersion:1};
    const race=await rpcRace("release versus cancel",clients.opsA,clients.opsB,"command_release_rental",
      {...common,commandId:"C4D-R4-REL",idempotencyKey:"C4D-R4-REL"},"command_cancel_rental",
      {...common,commandId:"C4D-R4-CAN",idempotencyKey:"C4D-R4-CAN"});
    expectOneWinner(race);
    const row=await clients.opsA.schema("erp").from("rentals").select("status").eq("id","UAT-C4D-R4").single();
    expect(["Released","Cancelled"]).toContain(row.data?.status);
  });

  it("Race 5: activate versus cancel has one valid result", async () => {
    const common={rentalId:"UAT-C4D-R5",expectedVersion:1};
    const race=await rpcRace("activate versus cancel",clients.opsA,clients.opsB,"command_activate_rental",
      {...common,commandId:"C4D-R5-ACT",idempotencyKey:"C4D-R5-ACT"},"command_cancel_rental",
      {...common,commandId:"C4D-R5-CAN",idempotencyKey:"C4D-R5-CAN"});
    assertConcurrent(race);
    expect(accepted(race.a)).toBe(true);
    expect(accepted(race.b)).toBe(false);
  });

  it("Race 6: return versus approved reverse-return recovery is version-safe", async () => {
    const race=await rpcRace("return versus recovery",clients.opsA,clients.recoveryA,"command_return_all_rental_lines",
      {commandId:"C4D-R6-RET",idempotencyKey:"C4D-R6-RET",rentalId:"UAT-C4D-R6",expectedVersion:1},
      "command_reverse_rental_return",{commandId:"C4D-R6-REC",idempotencyKey:"C4D-R6-REC",rentalId:"UAT-C4D-R6",expectedVersion:1,
        reason:"Concurrent return recovery validation"});
    assertConcurrent(race); expect([accepted(race.a),accepted(race.b)].filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("Race 7: two consumers create one active consumption", async () => {
    const make=(side:string,statementId:string)=>({commandId:`C4D-R7-${side}`,idempotencyKey:`C4D-R7-${side}`,statementId,
      deurId:"UAT-C4D-D20",lineId:`UAT-C4D-R7-L-${side}`,expectedVersion:1});
    const race=await rpcRace("two consumers",clients.financeA,clients.financeB,"command_consume_deur",make("A","UAT-C4D-BS20-A"),
      "command_consume_deur",make("B","UAT-C4D-BS20-B"));
    expectOneWinner(race);
    const lines=await clients.financeA.schema("erp").from("billing_statement_lines").select("id").eq("deur_id","UAT-C4D-D20").is("consumption_released_at",null);
    expect(lines.data).toHaveLength(1);
  });

  it.each([1,2,3])("Race 8.%i: void versus invoice creation remains financially valid", async (iteration) => {
    const id=iteration===1?"UAT-C4D-BS8":`UAT-C4D-BS8-${iteration}`;
    const common={statementId:id,expectedVersion:1};
    const race=await rpcRace(`void versus invoice ${iteration}`,clients.recoveryA,clients.financeA,"command_void_billing_statement",
      {...common,commandId:`C4D-R8-V-${iteration}`,idempotencyKey:`C4D-R8-V-${iteration}`,reason:"Concurrent statement void validation"},
      "command_create_invoice",{...common,commandId:`C4D-R8-I-${iteration}`,idempotencyKey:`C4D-R8-I-${iteration}`});
    expectOneWinner(race);
  });

  it.each([1,2,3])("Race 9.%i: release versus new consumption never overlaps", async (iteration) => {
    const suffix=iteration===1?"":`-${iteration}`;
    const race=await rpcRace(`release versus consume ${iteration}`,clients.recoveryA,clients.financeA,"command_release_deur_consumption",
      {commandId:`C4D-R9-REL-${iteration}`,idempotencyKey:`C4D-R9-REL-${iteration}`,statementId:`UAT-C4D-BS21-OLD${suffix}`,deurId:`UAT-C4D-D21${suffix}`,
        expectedVersion:1,reason:"Concurrent consumption release validation"},
      "command_consume_deur",{commandId:`C4D-R9-CONS-${iteration}`,idempotencyKey:`C4D-R9-CONS-${iteration}`,statementId:`UAT-C4D-BS9-NEW${suffix}`,
        deurId:`UAT-C4D-D21${suffix}`,lineId:`UAT-C4D-R9-NEW-${iteration}`,expectedVersion:1});
    expectOneWinner(race);
    const active=await clients.financeA.schema("erp").from("billing_statement_lines").select("id").eq("deur_id",`UAT-C4D-D21${suffix}`).is("consumption_released_at",null);
    expect((active.data??[]).length).toBeLessThanOrEqual(1);
  });

  it("Race 10: duplicate recovery produces one immutable record", async () => {
    const make=(side:string)=>({commandId:`C4D-R10-${side}`,idempotencyKey:`C4D-R10-${side}`,statementId:"UAT-C4D-BS10",
      expectedVersion:1,reason:"Duplicate recovery concurrency validation"});
    const race=await rpcRace("duplicate recovery",clients.recoveryA,clients.recoveryB,"command_void_billing_statement",make("A"),
      "command_void_billing_statement",make("B"));
    expectOneWinner(race);
    const rows=await clients.recoveryA.schema("erp").from("recovery_compensations").select("id").eq("target_entity_id","UAT-C4D-BS10");
    expect(rows.data).toHaveLength(1);
  });

  it("Race 11: identical actor-scoped key replays one release", async () => {
    const command={commandId:"C4D-R11-A",idempotencyKey:"C4D-R11-SAME",rentalId:"UAT-C4D-R11",expectedVersion:1};
    const race=await rpcRace("identical idempotency",clients.opsA,opsASecond,"command_release_rental",command,
      "command_release_rental",{...command,commandId:"C4D-R11-B"});
    assertConcurrent(race);
    expect([code(race.a),code(race.b)].sort()).toEqual(["ACCEPTED","REPLAYED"]);
  });

  it("Race 12: different payload with same actor-scoped key has one winner", async () => {
    const base={idempotencyKey:"C4D-R12-SAME",customerId:"UAT-C4D-CUSTOMER",projectId:"UAT-C4D-PROJECT",
      dateOut:"2026-07-29",rentalType:"Operated Rental"};
    const make=(side:string,n:string)=>({...base,commandId:`C4D-R12-${side}`,rentalId:`UAT-C4D-R12-${side}`,
      rentalNumber:`UAT-C4D-R12-${side}`,lines:[{id:`UAT-C4D-R12-${side}-L`,equipmentId:`UAT-C4D-EQ-${n}`,
        assignmentId:`UAT-C4D-ASG-${n}`,operatorId:`UAT-C4D-OP-${n}`}]});
    const race=await rpcRace("different idempotency",clients.opsA,opsASecond,"command_create_reserved_rental",make("A","09"),
      "command_create_reserved_rental",make("B","10"));
    expectOneWinner(race);
    expect([code(race.a),code(race.b)]).toContain("IDEMPOTENCY_MISMATCH");
  });

  it("captures all required race evidence without deadlocks", () => {
    expect(evidence.map((item)=>item.race)).toEqual(expect.arrayContaining([
      "same equipment","opposite order 1","opposite order 2","opposite order 3","duplicate release",
      "release versus cancel","activate versus cancel","return versus recovery","two consumers",
      "void versus invoice 1","void versus invoice 2","void versus invoice 3",
      "release versus consume 1","release versus consume 2","release versus consume 3",
      "duplicate recovery","identical idempotency","different idempotency",
    ]));
    expect(evidence.every((item)=>!item.deadlock)).toBe(true);
  });
});
