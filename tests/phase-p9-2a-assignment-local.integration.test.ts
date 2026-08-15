import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createRemoteCore } from "@/core/remote";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";
import { createSupabaseReadRepositories } from "@/integrations/supabase/readRepositories";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";

const configuration = readSupabasePhaseC2TestConfiguration();
const localTarget = configuration.url ? ["localhost", "127.0.0.1"].includes(new URL(configuration.url).hostname) : false;
const enabled = configuration.enabled && localTarget && process.env.RUN_P9_2A_LOCAL === "true";
const localDatabaseContainer = process.env.P9_2A_LOCAL_DB_CONTAINER ?? "";
const tenant = "TENANT-UAT-P9-2A";
const ids = {
  role: "ROLE-P9-2A", operator: "OPERATOR-P9-2A", project: "PROJECT-P9-2A",
  equipment: "EQUIPMENT-P9-2A", assignment: "ASSIGNMENT-P9-2A",
};

describe.skipIf(!enabled)("P9.2A two independent local Supabase clients", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  const email = `p9-2a-${randomBytes(8).toString("hex")}@example.invalid`;
  const password = `P9A-${randomBytes(24).toString("base64url")}`;
  const deniedEmail = `p9-2a-denied-${randomBytes(8).toString("hex")}@example.invalid`;
  const inactiveEmail = `p9-2a-inactive-${randomBytes(8).toString("hex")}@example.invalid`;
  const missingEmail = `p9-2a-missing-${randomBytes(8).toString("hex")}@example.invalid`;
  let userId = "";
  let deniedUserId = "";
  let inactiveUserId = "";
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let deniedClient: SupabaseClient;
  let inactiveClient: SupabaseClient;
  let missingClient: SupabaseClient;

  const owner = (sql: string) => {
    if (!localDatabaseContainer.startsWith("supabase_db_")) throw new Error("A verified local Supabase database container is required.");
    if (/\b(?:TENANT-(?!UAT-P9-2A)|service_role|grant|revoke|alter\s+(?:table|role|schema)|truncate)\b/i.test(sql)) {
      throw new Error("P9.2A local fixture SQL contains a forbidden target or authority operation.");
    }
    const result = spawnSync("docker", ["exec", "-i", localDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], {
      input: sql, encoding: "utf8", windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`Local fixture SQL failed (${result.status ?? "unknown"}): ${result.stderr}`);
  };
  const client = (key: string) => createClient(configuration.url!, configuration.publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: key },
  });

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    const created = await harness!.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Local Auth fixture creation failed.");
    userId = created.data.user.id;
    const denied = await harness!.admin.auth.admin.createUser({ email: deniedEmail, password, email_confirm: true });
    const inactive = await harness!.admin.auth.admin.createUser({ email: inactiveEmail, password, email_confirm: true });
    const missing = await harness!.admin.auth.admin.createUser({ email: missingEmail, password, email_confirm: true });
    if (denied.error || inactive.error || missing.error || !denied.data.user || !inactive.data.user || !missing.data.user) throw new Error("Authority fixture Auth creation failed.");
    deniedUserId = denied.data.user.id;
    inactiveUserId = inactive.data.user.id;
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class) VALUES
        ('${tenant}','P92A','P9.2A Local','test'),('TENANT-UAT-P9-2A-B','P92B','P9.2A Local B','test');
      INSERT INTO erp.operators(id,name,status,company_id) VALUES
        ('${ids.operator}','P9 Operator','Active','${tenant}'),('OPERATOR-P9-2A-2','P9 Operator 2','Active','${tenant}'),
        ('OPERATOR-P9-2A-3','P9 Operator 3','Active','${tenant}'),('OPERATOR-P9-2A-4','P9 Operator 4','Active','${tenant}'),
        ('OPERATOR-P9-2A-5','P9 Operator 5','Active','${tenant}'),
        ('OPERATOR-P9-2A-INACTIVE','P9 Inactive Operator','Suspended','${tenant}'),
        ('OPERATOR-P9-2A-B','P9 Operator B','Active','TENANT-UAT-P9-2A-B');
      INSERT INTO erp.projects(id,name,active,company_id) VALUES
        ('${ids.project}','P9 Project',true,'${tenant}'),('PROJECT-P9-2A-INACTIVE','P9 Inactive Project',false,'${tenant}'),
        ('PROJECT-P9-2A-B','P9 Project B',true,'TENANT-UAT-P9-2A-B');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,current_reading,active,deleted_at,company_id)
      SELECT item.id,item.asset,item.name,s.id,'Engine Hours',0,item.active,item.deleted_at,item.company_id
      FROM (VALUES
        ('${ids.equipment}','P9-EQ-1','P9 Equipment',true,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-2','P9-EQ-2','P9 Equipment 2',true,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-3','P9-EQ-3','P9 Equipment 3',true,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-4','P9-EQ-4','P9 Equipment 4',true,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-5','P9-EQ-5','P9 Equipment 5',true,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-INACTIVE','P9-EQ-I','P9 Inactive Equipment',false,NULL::timestamptz,'${tenant}'),
        ('EQUIPMENT-P9-2A-DELETED','P9-EQ-D','P9 Deleted Equipment',true,clock_timestamp(),'${tenant}'),
        ('EQUIPMENT-P9-2A-B','P9-EQ-B','P9 Equipment B',true,NULL::timestamptz,'TENANT-UAT-P9-2A-B')
      ) item(id,asset,name,active,deleted_at,company_id)
      CROSS JOIN LATERAL (SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1) s;
      INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES('${userId}'::uuid,'${email}','P9 Operations','active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
        ('${deniedUserId}'::uuid,'${deniedEmail}','P9 Denied','active','${tenant}'),
        ('${inactiveUserId}'::uuid,'${inactiveEmail}','P9 Inactive','inactive','${tenant}');
      INSERT INTO erp.app_roles(id,code,name) VALUES('${ids.role}','p9-operations','P9 Operations');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT '${ids.role}',id FROM erp.app_permissions WHERE code='assignment.manage';
      INSERT INTO erp.user_roles(user_id,role_id) VALUES('${userId}'::uuid,'${ids.role}');
      COMMIT;
    `);
    clientA = client(`p9-2a-a-${randomUUID()}`);
    clientB = client(`p9-2a-b-${randomUUID()}`);
    deniedClient = client(`p9-2a-denied-${randomUUID()}`);
    inactiveClient = client(`p9-2a-inactive-${randomUUID()}`);
    missingClient = client(`p9-2a-missing-${randomUUID()}`);
    expect((await clientA.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await clientB.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await deniedClient.auth.signInWithPassword({ email: deniedEmail, password })).error).toBeNull();
    expect((await inactiveClient.auth.signInWithPassword({ email: inactiveEmail, password })).error).toBeNull();
    expect((await missingClient.auth.signInWithPassword({ email: missingEmail, password })).error).toBeNull();
  });

  it("makes Client A's canonical Assignment visible to independent Client B", async () => {
    const command = {
      commandId: randomUUID(), idempotencyKey: randomUUID(), assignmentId: ids.assignment,
      equipmentId: ids.equipment, operatorId: ids.operator, projectId: ids.project,
      assignedDate: "2026-08-15", expectedReturn: "2026-08-16", remarks: "Two-client proof",
    };
    const writer = new SupabaseAssignmentCommandRepository(clientA);
    await expect(writer.createAssignment(command)).resolves.toMatchObject({
      success: true,
      value: {
        id: ids.assignment, companyId: tenant, equipmentId: ids.equipment, operatorId: ids.operator,
        projectId: ids.project, status: "Active", rowVersion: 1,
      },
    });
    const reader = createSupabaseReadRepositories(clientB, createRemoteCore()).assignments;
    await expect(reader.getById(ids.assignment)).resolves.toMatchObject({
      success: true,
      value: { id: ids.assignment, companyId: tenant, equipmentId: ids.equipment, operatorId: ids.operator, projectId: ids.project, status: "Active", rowVersion: 1 },
    });
    const equipmentBeforeReplay = await clientB.schema("erp").from("equipment").select("status_id,project_id,operator_id,row_version").eq("id", ids.equipment).single();
    expect(equipmentBeforeReplay.error).toBeNull();
    expect(equipmentBeforeReplay.data).toMatchObject({ status_id: "equipment-status-assigned", project_id: ids.project, operator_id: ids.operator });
    const replay = await writer.createAssignment({ ...command, commandId: randomUUID() });
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED", value: { id: ids.assignment } });
    const equipmentAfterReplay = await clientB.schema("erp").from("equipment").select("status_id,project_id,operator_id,row_version").eq("id", ids.equipment).single();
    expect(equipmentAfterReplay.data).toEqual(equipmentBeforeReplay.data);
    const audit = await clientB.schema("erp").from("audit_log").select("id").eq("aggregate_id", ids.assignment);
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
  });

  it("fails closed across the live authority and validation matrix without partial mutations", async () => {
    const base = (suffix: string, overrides: Record<string, unknown> = {}) => ({
      commandId: `command-${suffix}`, idempotencyKey: `key-${suffix}`, assignmentId: `ASSIGNMENT-P9-2A-${suffix}`,
      equipmentId: "EQUIPMENT-P9-2A-2", operatorId: "OPERATOR-P9-2A-2", projectId: ids.project,
      assignedDate: "2026-08-15", expectedReturn: "2026-08-16", ...overrides,
    });
    const invoke = async (rpcClient: SupabaseClient, command: Record<string, unknown>) => rpcClient.schema("erp").rpc("command_create_assignment", { command });
    const rejected = async (rpcClient: SupabaseClient, suffix: string, overrides: Record<string, unknown>, code: string) => {
      const command = base(suffix, overrides);
      const before = await clientB.schema("erp").from("equipment").select("status_id,project_id,operator_id").eq("id", command.equipmentId as string).maybeSingle();
      const result = await invoke(rpcClient, command);
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ success: false, code });
      expect((await clientB.schema("erp").from("assignments").select("id").eq("id", command.assignmentId as string)).data).toHaveLength(0);
      expect((await clientB.schema("erp").from("audit_log").select("id").eq("aggregate_id", command.assignmentId as string)).data).toHaveLength(0);
      const after = await clientB.schema("erp").from("equipment").select("status_id,project_id,operator_id").eq("id", command.equipmentId as string).maybeSingle();
      expect(after.data).toEqual(before.data);
    };

    const anonymous = client(`p9-2a-anon-${randomUUID()}`);
    expect((await invoke(anonymous, base("ANON"))).error?.code).toBe("42501");
    await rejected(missingClient, "MISSING-USER", {}, "UNAUTHENTICATED");
    await rejected(inactiveClient, "INACTIVE-USER", {}, "UNAUTHENTICATED");
    await rejected(deniedClient, "DENIED", {}, "FORBIDDEN");
    for (const [field, value] of [["company_id", tenant], ["tenant_id", tenant], ["actorId", userId], ["user_id", userId], ["status", "Completed"]] as const) {
      await rejected(clientA, `AUTH-${field}`, { [field]: value }, "VALIDATION_REJECTED");
    }
    await rejected(clientA, "CROSS-EQUIPMENT", { equipmentId: "EQUIPMENT-P9-2A-B" }, "NOT_FOUND");
    await rejected(clientA, "CROSS-OPERATOR", { operatorId: "OPERATOR-P9-2A-B" }, "NOT_FOUND");
    await rejected(clientA, "CROSS-PROJECT", { projectId: "PROJECT-P9-2A-B" }, "NOT_FOUND");
    await rejected(clientA, "INACTIVE-EQUIPMENT", { equipmentId: "EQUIPMENT-P9-2A-INACTIVE" }, "NOT_FOUND");
    await rejected(clientA, "DELETED-EQUIPMENT", { equipmentId: "EQUIPMENT-P9-2A-DELETED" }, "NOT_FOUND");
    await rejected(clientA, "INACTIVE-OPERATOR", { operatorId: "OPERATOR-P9-2A-INACTIVE" }, "NOT_FOUND");
    await rejected(clientA, "INACTIVE-PROJECT", { projectId: "PROJECT-P9-2A-INACTIVE" }, "NOT_FOUND");
    await rejected(clientA, " INVALID-ID ", { assignmentId: " INVALID-ID " }, "VALIDATION_REJECTED");
    await rejected(clientA, "INVALID-DATES", { assignedDate: "2026-08-17", expectedReturn: "2026-08-16" }, "VALIDATION_REJECTED");
    await rejected(clientA, "INVALID-ACTIVITY", { activityCodeId: "ACTIVITY-MISSING" }, "NOT_FOUND");
    await rejected(clientA, "EQUIPMENT-CONFLICT", { equipmentId: ids.equipment, operatorId: "OPERATOR-P9-2A-2" }, "EQUIPMENT_UNAVAILABLE");
    await rejected(clientA, "OPERATOR-CONFLICT", { equipmentId: "EQUIPMENT-P9-2A-2", operatorId: ids.operator }, "CONFLICT");
    const mismatchBase = base("MISMATCH");
    expect((await invoke(clientA, mismatchBase)).data).toMatchObject({ success: true });
    expect((await invoke(clientA, { ...mismatchBase, remarks: "changed" })).data).toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
    expect((await clientB.schema("erp").from("assignments").select("id").eq("id", mismatchBase.assignmentId)).data).toHaveLength(1);
    expect((await clientB.schema("erp").from("audit_log").select("id").eq("aggregate_id", mismatchBase.assignmentId)).data).toHaveLength(1);
  });

  it("allows exactly one winner for competing Equipment and Operator assignments", async () => {
    const command = (id: string, equipmentId: string, operatorId: string) => ({
      commandId: randomUUID(), idempotencyKey: randomUUID(), assignmentId: id, equipmentId, operatorId,
      projectId: ids.project, assignedDate: "2026-08-15", expectedReturn: "2026-08-16",
    });
    const invoke = (value: ReturnType<typeof command>) => clientA.schema("erp").rpc("command_create_assignment", { command: value }).then((result) => result.data as { success: boolean });
    const sameEquipment = await Promise.all([
      invoke(command("ASSIGNMENT-P9-2A-RACE-E1", "EQUIPMENT-P9-2A-3", "OPERATOR-P9-2A-3")),
      invoke(command("ASSIGNMENT-P9-2A-RACE-E2", "EQUIPMENT-P9-2A-3", "OPERATOR-P9-2A-4")),
    ]);
    expect(sameEquipment.filter((result) => result.success)).toHaveLength(1);
    expect((await clientB.schema("erp").from("assignments").select("id").eq("equipment_id", "EQUIPMENT-P9-2A-3")).data).toHaveLength(1);
    const sameOperator = await Promise.all([
      invoke(command("ASSIGNMENT-P9-2A-RACE-O1", "EQUIPMENT-P9-2A-4", "OPERATOR-P9-2A-5")),
      invoke(command("ASSIGNMENT-P9-2A-RACE-O2", "EQUIPMENT-P9-2A-5", "OPERATOR-P9-2A-5")),
    ]);
    expect(sameOperator.filter((result) => result.success)).toHaveLength(1);
    expect((await clientB.schema("erp").from("assignments").select("id").eq("operator_id", "OPERATOR-P9-2A-5")).data).toHaveLength(1);
  });
});
