import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { assertSupabaseFixtureMutationAllowed, createSupabasePhaseC2Harness, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";

const config = readSupabasePhaseC2TestConfiguration();
const local = config.url ? ["localhost", "127.0.0.1"].includes(new URL(config.url).hostname) : false;
const enabled = config.enabled && local && process.env.RUN_P9_2F_LOCAL === "true";
const container = process.env.P9_2F_LOCAL_DB_CONTAINER ?? "";
const tenant = "TENANT-UAT-P9-2F", otherTenant = "TENANT-UAT-P9-2F-B", inactiveTenant = "TENANT-UAT-P9-2F-INACTIVE";
const financialTables = ["billing_statements", "billing_statement_lines", "commercial_snapshots"] as const;

describe.skipIf(!enabled)("P9.2F financial evidence authorization", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(config) : undefined;
  const password = `P9F-${randomBytes(24).toString("base64url")}`;
  const clients: Record<string, SupabaseClient> = {};
  const identities: Record<string, { id: string; email: string }> = {};
  const labels = ["administrator", "operations", "billing", "management", "auditor", "dispatcher", "coordinator", "maintenance", "operator-a", "operator-b", "linked-broad", "missing", "inactive-user", "inactive-company", "inactive-operator"];
  const owner = (sql: string) => {
    if (!container.startsWith("supabase_db_")) throw new Error("Verified local container required");
    const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr);
  };

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(config, [tenant, otherTenant, inactiveTenant]);
    for (const label of labels) {
      const result = await harness!.admin.auth.admin.createUser({ email: `p9-2f-${label}-${randomBytes(5).toString("hex")}@example.invalid`, password, email_confirm: true });
      if (result.error || !result.data.user) throw result.error;
      identities[label] = { id: result.data.user.id, email: result.data.user.email! };
    }
    owner(`BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class,active) VALUES
        ('${tenant}','P92F','P9.2F','test',true),('${otherTenant}','P92FB','P9.2F B','test',true),('${inactiveTenant}','P92FI','P9.2F Inactive','test',false);
      INSERT INTO erp.customers(id,name,active,company_id) VALUES ('CUSTOMER-P9-2F','Customer',true,'${tenant}'),('CUSTOMER-P9-2F-B','Customer B',true,'${otherTenant}');
      INSERT INTO erp.projects(id,name,customer_id,active,company_id) VALUES ('PROJECT-P9-2F','Project','CUSTOMER-P9-2F',true,'${tenant}'),('PROJECT-P9-2F-B','Project B','CUSTOMER-P9-2F-B',true,'${otherTenant}');
      INSERT INTO erp.cost_codes(id,code,name) VALUES ('COST-P9-2F','P92F','Cost');
      INSERT INTO erp.activity_codes(id,code,name) VALUES ('ACT-P9-2F','P92F','Activity');
      INSERT INTO erp.operators(id,name,status,company_id) VALUES
        ('OP-P9-2F-A','A','Active','${tenant}'),('OP-P9-2F-B','B','Active','${tenant}'),('OP-P9-2F-INACTIVE','Inactive','Suspended','${tenant}'),
        ('OP-P9-2F-BROAD','Broad','Active','${tenant}'),('OP-P9-2F-FOREIGN','Foreign','Active','${otherTenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,cost_code_id,company_id)
        SELECT 'EQ-P9-2F-'||x.label,'P92F-'||x.label,'Equipment '||x.label,s.id,'Engine Hours','COST-P9-2F',x.company_id
        FROM (VALUES('A','${tenant}'),('B','${tenant}'),('FOREIGN','${otherTenant}')) x(label,company_id)
        CROSS JOIN LATERAL (SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' LIMIT 1) s;
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id) VALUES
        ('AS-P9-2F-A','EQ-P9-2F-A','OP-P9-2F-A','PROJECT-P9-2F','ACT-P9-2F','2026-08-15','2026-08-20','Active','${tenant}'),
        ('AS-P9-2F-B','EQ-P9-2F-B','OP-P9-2F-B','PROJECT-P9-2F','ACT-P9-2F','2026-08-15','2026-08-20','Active','${tenant}'),
        ('AS-P9-2F-FOREIGN','EQ-P9-2F-FOREIGN','OP-P9-2F-FOREIGN','PROJECT-P9-2F-B','ACT-P9-2F','2026-08-15','2026-08-20','Active','${otherTenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,released_at,company_id) VALUES
        ('RENTAL-P9-2F-A','P92F-A','CUSTOMER-P9-2F','PROJECT-P9-2F','Customer','Project','2026-08-15','Operated Rental','Released',clock_timestamp(),'${tenant}'),
        ('RENTAL-P9-2F-B','P92F-B','CUSTOMER-P9-2F','PROJECT-P9-2F','Customer','Project','2026-08-15','Operated Rental','Released',clock_timestamp(),'${tenant}'),
        ('RENTAL-P9-2F-FOREIGN','P92F-F','CUSTOMER-P9-2F-B','PROJECT-P9-2F-B','Customer B','Project B','2026-08-15','Bare Rental','Released',clock_timestamp(),'${otherTenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id) VALUES
        ('LINE-P9-2F-A','RENTAL-P9-2F-A','EQ-P9-2F-A','AS-P9-2F-A','OP-P9-2F-A','Released','${tenant}'),
        ('LINE-P9-2F-B','RENTAL-P9-2F-B','EQ-P9-2F-B','AS-P9-2F-B','OP-P9-2F-B','Released','${tenant}'),
        ('LINE-P9-2F-FOREIGN','RENTAL-P9-2F-FOREIGN','EQ-P9-2F-FOREIGN','AS-P9-2F-FOREIGN','OP-P9-2F-FOREIGN','Released','${otherTenant}');
      INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at) VALUES
        ('SNAP-P9-2F-A','RENTAL-P9-2F-A','LINE-P9-2F-A','Per Hour',100,true,'PHP',clock_timestamp()),
        ('SNAP-P9-2F-B','RENTAL-P9-2F-B','LINE-P9-2F-B','Per Hour',200,true,'PHP',clock_timestamp()),
        ('SNAP-P9-2F-FOREIGN','RENTAL-P9-2F-FOREIGN','LINE-P9-2F-FOREIGN','Per Hour',300,true,'PHP',clock_timestamp());
      INSERT INTO erp.deurs(id,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,work_date,status,company_id) VALUES
        ('DEUR-P9-2F-A','RENTAL-P9-2F-A','LINE-P9-2F-A','AS-P9-2F-A','EQ-P9-2F-A','OP-P9-2F-A','PROJECT-P9-2F','CUSTOMER-P9-2F','SNAP-P9-2F-A','2026-08-15','Submitted','${tenant}'),
        ('DEUR-P9-2F-B','RENTAL-P9-2F-B','LINE-P9-2F-B','AS-P9-2F-B','EQ-P9-2F-B','OP-P9-2F-B','PROJECT-P9-2F','CUSTOMER-P9-2F','SNAP-P9-2F-B','2026-08-15','Submitted','${tenant}'),
        ('DEUR-P9-2F-FOREIGN','RENTAL-P9-2F-FOREIGN','LINE-P9-2F-FOREIGN','AS-P9-2F-FOREIGN','EQ-P9-2F-FOREIGN','OP-P9-2F-FOREIGN','PROJECT-P9-2F-B','CUSTOMER-P9-2F-B','SNAP-P9-2F-FOREIGN','2026-08-15','Submitted','${otherTenant}');
      INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,grand_total,approval_status,invoice_status,created_by,company_id) VALUES
        ('BILL-P9-2F-A','P92F-A','RENTAL-P9-2F-A','Customer','Project','2026-08-15','2026-08-15',100,100,'Draft','Not Invoiced','fixture','${tenant}'),
        ('BILL-P9-2F-B','P92F-B','RENTAL-P9-2F-B','Customer','Project','2026-08-15','2026-08-15',200,200,'Draft','Not Invoiced','fixture','${tenant}'),
        ('BILL-P9-2F-FOREIGN','P92F-F','RENTAL-P9-2F-FOREIGN','Customer B','Project B','2026-08-15','2026-08-15',300,300,'Draft','Not Invoiced','fixture','${otherTenant}');
      INSERT INTO erp.billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,work_date,description,amount,grand_total,company_id) VALUES
        ('BILL-LINE-P9-2F-A','BILL-P9-2F-A','LINE-P9-2F-A','EQ-P9-2F-A','DEUR-P9-2F-A','OP-P9-2F-A','2026-08-15','A',100,100,'${tenant}'),
        ('BILL-LINE-P9-2F-B','BILL-P9-2F-B','LINE-P9-2F-B','EQ-P9-2F-B','DEUR-P9-2F-B','OP-P9-2F-B','2026-08-15','B',200,200,'${tenant}'),
        ('BILL-LINE-P9-2F-FOREIGN','BILL-P9-2F-FOREIGN','LINE-P9-2F-FOREIGN','EQ-P9-2F-FOREIGN','DEUR-P9-2F-FOREIGN','OP-P9-2F-FOREIGN','2026-08-15','Foreign',300,300,'${otherTenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
        ('${identities.administrator.id}'::uuid,'p92f-admin','Administrator','active',NULL,'${tenant}'),
        ('${identities.operations.id}'::uuid,'p92f-operations','Operations','active',NULL,'${tenant}'),
        ('${identities.billing.id}'::uuid,'p92f-billing','Billing','active',NULL,'${tenant}'),
        ('${identities.management.id}'::uuid,'p92f-management','Management','active',NULL,'${tenant}'),
        ('${identities.auditor.id}'::uuid,'p92f-auditor','Auditor','active',NULL,'${tenant}'),
        ('${identities.dispatcher.id}'::uuid,'p92f-dispatcher','Dispatcher','active',NULL,'${tenant}'),
        ('${identities.coordinator.id}'::uuid,'p92f-coordinator','Coordinator','active',NULL,'${tenant}'),
        ('${identities.maintenance.id}'::uuid,'p92f-maintenance','Maintenance','active',NULL,'${tenant}'),
        ('${identities["operator-a"].id}'::uuid,'p92f-operator-a','Operator A','active','OP-P9-2F-A','${tenant}'),
        ('${identities["operator-b"].id}'::uuid,'p92f-operator-b','Operator B','active','OP-P9-2F-B','${tenant}'),
        ('${identities["linked-broad"].id}'::uuid,'p92f-linked-broad','Linked Broad','active','OP-P9-2F-BROAD','${tenant}'),
        ('${identities["inactive-user"].id}'::uuid,'p92f-inactive-user','Inactive User','inactive',NULL,'${tenant}'),
        ('${identities["inactive-company"].id}'::uuid,'p92f-inactive-company','Inactive Company','active',NULL,'${inactiveTenant}'),
        ('${identities["inactive-operator"].id}'::uuid,'p92f-inactive-operator','Inactive Operator','active','OP-P9-2F-INACTIVE','${tenant}');
      INSERT INTO erp.app_roles(id,code,name) VALUES
        ('ROLE-P9-2F-FINANCE','p9-2f-finance','P9.2F Finance Reader'),
        ('ROLE-P9-2F-COMMERCIAL','p9-2f-commercial','P9.2F Commercial Reader'),
        ('ROLE-P9-2F-NONE','p9-2f-none','P9.2F Non-financial'),
        ('ROLE-P9-2F-OPERATOR','p9-2f-operator','P9.2F Operator'),
        ('ROLE-P9-2F-BROAD','p9-2f-broad','P9.2F Broad');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-P9-2F-FINANCE',id FROM erp.app_permissions WHERE code IN('billing.read','collections.read','rental.read','rental.commercialTerms.read');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-P9-2F-COMMERCIAL',id FROM erp.app_permissions WHERE code IN('rental.read','rental.commercialTerms.read');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-P9-2F-OPERATOR',id FROM erp.app_permissions WHERE code IN('billing.read','collections.read','rental.commercialTerms.read','rental.read','assignment.read','deur.read');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-P9-2F-BROAD',id FROM erp.app_permissions;
      INSERT INTO erp.user_roles(user_id,role_id)
        SELECT mapping.user_id::uuid,role.id FROM (VALUES
          ('${identities.administrator.id}','p9-2f-broad'),('${identities.operations.id}','p9-2f-finance'),
          ('${identities.billing.id}','p9-2f-finance'),('${identities.management.id}','p9-2f-finance'),
          ('${identities.auditor.id}','p9-2f-finance'),('${identities.dispatcher.id}','p9-2f-commercial'),
          ('${identities.coordinator.id}','p9-2f-none'),('${identities.maintenance.id}','p9-2f-none'),
          ('${identities["operator-a"].id}','p9-2f-operator'),('${identities["operator-b"].id}','p9-2f-operator'),
          ('${identities["linked-broad"].id}','p9-2f-broad'),('${identities["inactive-user"].id}','p9-2f-broad'),
          ('${identities["inactive-company"].id}','p9-2f-broad'),('${identities["inactive-operator"].id}','p9-2f-broad')
        ) mapping(user_id,role_code) JOIN erp.app_roles role ON role.code=mapping.role_code;
      COMMIT;`);
    for (const label of labels) {
      const client = createClient(config.url!, config.publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      expect((await client.auth.signInWithPassword({ email: identities[label].email, password })).error).toBeNull();
      clients[label] = client;
    }
  });

  const ids = async (label: string, table: typeof financialTables[number]) => {
    const result = await clients[label].schema("erp").from(table).select("id").order("id");
    expect(result.error).toBeNull();
    return (result.data ?? []).map((row) => row.id);
  };
  const expectNone = async (label: string) => { for (const table of financialTables) expect(await ids(label, table)).toEqual([]); };

  it("denies all and exact-ID financial reads to Operators, including a linked broad-role user", async () => {
    for (const label of ["operator-a", "operator-b", "linked-broad"]) {
      await expectNone(label);
      for (const [table, id] of [["billing_statements", "BILL-P9-2F-A"], ["billing_statement_lines", "BILL-LINE-P9-2F-A"], ["commercial_snapshots", "SNAP-P9-2F-A"]] as const) {
        const result = await clients[label].schema("erp").from(table).select("id").eq("id", id);
        expect(result.error).toBeNull(); expect(result.data).toEqual([]);
      }
    }
  });

  it("preserves authorized tenant-scoped Administrator, Operations, Billing, Management and Auditor reads", async () => {
    for (const label of ["administrator", "operations", "billing", "management", "auditor"]) {
      expect(await ids(label, "billing_statements")).toEqual(["BILL-P9-2F-A", "BILL-P9-2F-B"]);
      expect(await ids(label, "billing_statement_lines")).toEqual(["BILL-LINE-P9-2F-A", "BILL-LINE-P9-2F-B"]);
      expect(await ids(label, "commercial_snapshots")).toEqual(["SNAP-P9-2F-A", "SNAP-P9-2F-B"]);
    }
  });

  it("applies existing permissions to other roles without broadening finance access", async () => {
    expect(await ids("dispatcher", "billing_statements")).toEqual([]);
    expect(await ids("dispatcher", "billing_statement_lines")).toEqual([]);
    expect(await ids("dispatcher", "commercial_snapshots")).toEqual(["SNAP-P9-2F-A", "SNAP-P9-2F-B"]);
    await expectNone("coordinator"); await expectNone("maintenance"); await expectNone("missing");
    await expectNone("inactive-user"); await expectNone("inactive-company"); await expectNone("inactive-operator");
  });

  it("keeps read-only personas unable to insert financial evidence", async () => {
    for (const label of ["management", "auditor"]) {
      const result = await clients[label].schema("erp").from("billing_statements").insert({ id: `DENIED-${label}`, statement_no: `DENIED-${label}` });
      expect(result.error).not.toBeNull();
    }
  });
});
