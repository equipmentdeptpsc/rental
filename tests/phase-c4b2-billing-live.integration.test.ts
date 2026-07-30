import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingRateEngine } from "@/features/rental/billing/engine/BillingRateEngine";
import type { BillingCalculationTerms } from "@/features/rental/billing/engine/BillingCalculationTerms";
import type { DeurRecord } from "@/features/rental/deur";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C4B2_LIVE === "true";
const tenant = "TENANT-UAT-C4B2-BILLING";
const email = "tenant-uat-c4b2-finance@example.invalid";
const methods = ["Per Hour", "Per Day", "Per Week", "Per Month", "One Lot"] as const;
const fixtureMethods = [...methods, "Per Cubic Meter" as const];
const password = `C4B2-${randomBytes(24).toString("base64url")}`;

describe.skipIf(!enabled)("Phase C4B.2 live billing-method parity", () => {
  const admin = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let userId = "";
  let client: SupabaseClient;

  function cleanup() {
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [tenant],
      sql: `
        BEGIN;
        SET LOCAL session_replication_role='replica';
        DELETE FROM erp.billing_statement_lines WHERE company_id='${tenant}';
        DELETE FROM erp.billing_statements WHERE company_id='${tenant}';
        DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
        DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
        DELETE FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}';
        DELETE FROM erp.deur_activity_logs WHERE deur_id LIKE 'UAT-C4B2-BILLING-%';
        DELETE FROM erp.deur_events WHERE company_id='${tenant}';
        DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
        DELETE FROM erp.deurs WHERE company_id='${tenant}';
        DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
        DELETE FROM erp.audit_log WHERE company_id='${tenant}';
        DELETE FROM erp.commercial_snapshots WHERE rental_id LIKE 'UAT-C4B2-BILLING-%';
        DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
        DELETE FROM erp.rentals WHERE company_id='${tenant}';
        DELETE FROM erp.equipment WHERE company_id='${tenant}';
        DELETE FROM erp.operators WHERE company_id='${tenant}';
        DELETE FROM erp.projects WHERE company_id='${tenant}';
        DELETE FROM erp.customers WHERE company_id='${tenant}';
        DELETE FROM erp.user_roles WHERE user_id='${userId || "00000000-0000-0000-0000-000000000000"}'::uuid;
        DELETE FROM erp.users WHERE company_id='${tenant}';
        DELETE FROM erp.role_permissions WHERE role_id='ROLE-UAT-C4B2-FINANCE';
        DELETE FROM erp.app_roles WHERE id='ROLE-UAT-C4B2-FINANCE';
        DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4B2-%';
        DELETE FROM erp.companies WHERE id='${tenant}';
        COMMIT;
      `,
    });
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    const created = await admin!.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Finance Auth user creation failed.");
    userId = created.data.user.id;
    const lineRows = fixtureMethods.map((_, index) =>
      `('UAT-C4B2-BILLING-LINE-${index}','UAT-C4B2-BILLING-RENTAL-${index}','UAT-C4B2-BILLING-EQ-${index}','UAT-C4B2-BILLING-OP','Returned','${tenant}')`,
    ).join(",\n");
    const rentals = fixtureMethods.map((_, index) =>
      `('UAT-C4B2-BILLING-RENTAL-${index}','UAT-C4B2-BILLING-R-${index}','UAT-C4B2-BILLING-CUSTOMER','UAT-C4B2-BILLING-PROJECT','Customer','Project','2026-07-29','Operated Rental','Returned','${tenant}')`,
    ).join(",\n");
    const equipment = fixtureMethods.map((_, index) =>
      `('UAT-C4B2-BILLING-EQ-${index}','UAT-C4B2-BILLING-EQ-${index}','Equipment ${index}','None','${tenant}')`,
    ).join(",\n");
    const snapshots = fixtureMethods.map((method, index) =>
      `('UAT-C4B2-BILLING-SNAPSHOT-${index}','UAT-C4B2-BILLING-RENTAL-${index}','UAT-C4B2-BILLING-LINE-${index}','${method}',100,3,10,25,30,5,false,50,12,2,'PHP',${method === "One Lot" ? "700" : "NULL"},now())`,
    ).join(",\n");
    const deurs = fixtureMethods.map((method, index) =>
      `('UAT-C4B2-BILLING-DEUR-${index}','UAT-C4B2-BILLING-D-${index}','UAT-C4B2-BILLING-RENTAL-${index}','UAT-C4B2-BILLING-LINE-${index}','UAT-C4B2-BILLING-EQ-${index}','UAT-C4B2-BILLING-OP','UAT-C4B2-BILLING-PROJECT','UAT-C4B2-BILLING-CUSTOMER','UAT-C4B2-BILLING-SNAPSHOT-${index}','2026-07-29','Acknowledged','TIME_TIMELINE','${method}',120,60,'${tenant}')`,
    ).join(",\n");
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [tenant],
      sql: `
        BEGIN;
        INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C4B2 Billing','test');
        INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES('${userId}'::uuid,'${email}','C4B2 Finance','active','${tenant}');
        INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-UAT-C4B2-FINANCE','finance','C4B2 Finance');
        INSERT INTO erp.app_permissions(id,code,name) VALUES
          ('PERM-UAT-C4B2-CREATE','billing.create','Billing Create'),
          ('PERM-UAT-C4B2-UPDATE','billing.update','Billing Update');
        INSERT INTO erp.role_permissions(role_id,permission_id) VALUES
          ('ROLE-UAT-C4B2-FINANCE','PERM-UAT-C4B2-CREATE'),('ROLE-UAT-C4B2-FINANCE','PERM-UAT-C4B2-UPDATE');
        INSERT INTO erp.user_roles(user_id,role_id) VALUES('${userId}'::uuid,'ROLE-UAT-C4B2-FINANCE');
        INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('UAT-C4B2-BILLING-CUSTOMER','UAT-C4B2-BILLING-CUST','Customer','${tenant}');
        INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('UAT-C4B2-BILLING-PROJECT','UAT-C4B2-BILLING-PROJ','Project','UAT-C4B2-BILLING-CUSTOMER','${tenant}');
        INSERT INTO erp.operators(id,name,status,company_id) VALUES('UAT-C4B2-BILLING-OP','Operator','Active','${tenant}');
        INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES ${equipment};
        INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id) VALUES ${rentals};
        INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,operator_id,status,company_id) VALUES ${lineRows};
        INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,contract_amount,captured_at) VALUES ${snapshots};
        INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,work_date,status,evidence_mode,billing_method_snapshot,total_operating_minutes,total_idle_minutes,company_id) VALUES ${deurs};
        COMMIT;
      `,
    });
    client = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c4b2-billing" },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  }, 30_000);

  afterAll(async () => {
    await client?.auth.signOut();
    cleanup();
    cleanup();
    if (userId) await admin!.admin.auth.admin.deleteUser(userId);
  }, 30_000);

  for (const [index, method] of methods.entries()) {
    it(`${method} matches BillingRateEngine and completes statement consumption`, async () => {
      const terms: BillingCalculationTerms = {
        billingMethod: method, unitRate: 100, minimumBillableHours: 3, standbyRate: 10,
        mobilizationFee: 25, demobilizationFee: 30, fuelCharge: 5, operatorIncluded: false,
        operatorRate: 50, taxRate: 12, withholdingTax: 2, ...(method === "One Lot" ? { contractAmount: 700 } : {}),
      };
      const deur = {
        totalOperatingMinutes: 120, totalIdleMinutes: 60, totalMobilizationMinutes: 0,
        totalDemobilizationMinutes: 0,
      } as DeurRecord;
      const expected = BillingRateEngine.calculate(deur, terms);
      const evidence = await client.schema("erp").rpc("command_generate_billing_evidence", {
        command: { commandId: `C4B2-EVIDENCE-${index}`, idempotencyKey: `C4B2-EVIDENCE-${index}`, deurId: `UAT-C4B2-BILLING-DEUR-${index}` },
      });
      expect(evidence.error).toBeNull();
      expect(evidence.data.success).toBe(true);
      const actual = evidence.data.value;
      for (const field of ["operatingCharge","idleCharge","mobilizationCharge","demobilizationCharge","operatorCharge","fuelCharge","subtotal","vat","withholdingTax","grandTotal"] as const) {
        expect(Number(actual[field]), field).toBeCloseTo(expected[field], 4);
      }
      const statement = await client.schema("erp").rpc("command_create_billing_statement", {
        command: { commandId: `C4B2-STMT-${index}`, idempotencyKey: `C4B2-STMT-${index}`, statementId: `UAT-C4B2-BILLING-STMT-${index}`, rentalId: `UAT-C4B2-BILLING-RENTAL-${index}`, billingFrom: "2026-07-29", billingTo: "2026-07-29" },
      });
      expect(statement.data.success).toBe(true);
      const consumption = await client.schema("erp").rpc("command_consume_deur", {
        command: { commandId: `C4B2-CONSUME-${index}`, idempotencyKey: `C4B2-CONSUME-${index}`, statementId: `UAT-C4B2-BILLING-STMT-${index}`, deurId: `UAT-C4B2-BILLING-DEUR-${index}`, lineId: `UAT-C4B2-BILLING-BILL-LINE-${index}`, expectedVersion: 1 },
      });
      expect(consumption.data.success).toBe(true);
      const lines = await client.schema("erp").from("billing_statement_lines").select("id,grand_total").eq("deur_id", `UAT-C4B2-BILLING-DEUR-${index}`);
      expect(lines.error).toBeNull();
      expect(lines.data).toHaveLength(1);
      expect(Number(lines.data![0].grand_total)).toBeCloseTo(expected.grandTotal, 4);
      const audit = await client.schema("erp").from("audit_log").select("id").eq("aggregate_id", `UAT-C4B2-BILLING-STMT-${index}`);
      expect(audit.error).toBeNull();
      expect(audit.data!.length).toBeGreaterThanOrEqual(2);
    });
  }

  it("rejects Per Cubic Meter without statement or line mutation", async () => {
    const result = await client.schema("erp").rpc("command_generate_billing_evidence", {
      command: { commandId: "C4B2-CUBIC", idempotencyKey: "C4B2-CUBIC", deurId: "UAT-C4B2-BILLING-DEUR-5" },
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ success: false, code: "UNSUPPORTED_BILLING_METHOD" });
    const lines = await client.schema("erp").from("billing_statement_lines").select("id").eq("deur_id", "UAT-C4B2-BILLING-DEUR-5");
    expect(lines.data).toHaveLength(0);
  });
});
