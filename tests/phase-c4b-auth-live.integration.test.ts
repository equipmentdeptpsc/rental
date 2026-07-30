import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRemoteCore } from "@/core/remote";
import { SupabaseAuthenticationProvider } from "@/integrations/supabase/SupabaseAuthenticationProvider";
import { createSupabaseReadRepositories } from "@/integrations/supabase/readRepositories";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C4B_LIVE === "true";
const companyId = "TENANT-UAT-C4B-AUTH";
const email = "tenant-uat-c4b-auth@example.invalid";
const roleId = "ROLE-UAT-C4B-AUTH";
const permissionId = "PERM-UAT-C4B-AUTH";

describe.skipIf(!enabled)("Phase C4B real Supabase Auth", () => {
  const password = `C4B-${randomBytes(24).toString("base64url")}`;
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let userId = "";

  async function cleanup(): Promise<void> {
    if (userId) {
      executePhaseC4bPrivilegedSql(configuration, {
        tenantIds: [companyId],
        sql: `
          BEGIN;
          DELETE FROM erp.user_roles WHERE user_id='${userId}'::uuid;
          DELETE FROM erp.users WHERE id='${userId}'::uuid;
          DELETE FROM erp.role_permissions WHERE role_id='${roleId}';
          DELETE FROM erp.app_roles WHERE id='${roleId}';
          DELETE FROM erp.app_permissions WHERE id='${permissionId}';
          DELETE FROM erp.companies WHERE id='${companyId}';
          COMMIT;
        `,
      });
      await harness!.admin.auth.admin.deleteUser(userId);
    } else {
      executePhaseC4bPrivilegedSql(configuration, {
        tenantIds: [companyId],
        sql: `
          BEGIN;
          DELETE FROM erp.role_permissions WHERE role_id='${roleId}';
          DELETE FROM erp.app_roles WHERE id='${roleId}';
          DELETE FROM erp.app_permissions WHERE id='${permissionId}';
          DELETE FROM erp.companies WHERE id='${companyId}';
          COMMIT;
        `,
      });
    }
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [companyId]);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    await cleanup();
    const created = await harness!.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("Auth user was not created.");
    userId = created.data.user.id;
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [companyId],
      sql: `
        BEGIN;
        INSERT INTO erp.companies(id,code,name,environment_class)
        VALUES('${companyId}','${companyId}','C4B Auth','test');
        INSERT INTO erp.users(id,username,display_name,status,company_id)
        VALUES('${userId}'::uuid,'${email}','C4B Auth User','active','${companyId}');
        INSERT INTO erp.app_roles(id,code,name)
        VALUES('${roleId}','rental-operations','C4B Rental Operations');
        INSERT INTO erp.app_permissions(id,code,name)
        VALUES('${permissionId}','rental.manage','Rental Manage');
        INSERT INTO erp.role_permissions(role_id,permission_id)
        VALUES('${roleId}','${permissionId}');
        INSERT INTO erp.user_roles(user_id,role_id)
        VALUES('${userId}'::uuid,'${roleId}');
        COMMIT;
      `,
    });
  });

  afterAll(async () => {
    await cleanup();
    await cleanup();
  });

  function client() {
    return createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  it("signs in, issues and refreshes a session, and restores the canonical application identity", async () => {
    const remoteClient = client();
    const repositories = createSupabaseReadRepositories(remoteClient, createRemoteCore());
    const provider = new SupabaseAuthenticationProvider(remoteClient, repositories.users);
    const login = await provider.login({ username: email, password });
    expect(login).toMatchObject({
      success: true,
      value: {
        user: { id: userId, username: email, systemRoles: ["rental-operations"], status: "active" },
        permissions: ["rental.manage"],
      },
    });
    const session = await remoteClient.auth.getSession();
    expect(session.error).toBeNull();
    expect(session.data.session?.access_token).toBeTruthy();
    expect(session.data.session?.refresh_token).toBeTruthy();
    await expect(provider.refreshSession()).resolves.toMatchObject({
      success: true,
      value: { user: { id: userId }, session: { providerId: "supabase" } },
    });
    await expect(provider.restoreSession()).resolves.toMatchObject({
      success: true,
      value: { user: { id: userId } },
    });
    await expect(provider.logout()).resolves.toMatchObject({ success: true });
    await expect(provider.restoreSession()).resolves.toEqual({ success: true, value: null });
  });

  it("rejects incorrect credentials, anonymous RPC use, and caller-supplied company scope", async () => {
    const remoteClient = client();
    const bad = await remoteClient.auth.signInWithPassword({ email, password: `${password}-wrong` });
    expect(bad.error).toBeTruthy();
    const anonymous = await remoteClient.schema("erp").rpc("command_create_reserved_rental", {
      command: { commandId: "C4B-ANON", idempotencyKey: "C4B-ANON" },
    });
    expect(anonymous.error?.code).toBe("42501");

    const signedIn = await remoteClient.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    const scoped = await remoteClient.schema("erp").rpc("command_create_reserved_rental", {
      command: {
        commandId: "C4B-COMPANY-OVERRIDE",
        idempotencyKey: "C4B-COMPANY-OVERRIDE",
        companyId: "TENANT-LOCAL-001",
      },
    });
    expect(scoped.error).toBeNull();
    expect(scoped.data).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
  });

  it("rejects inactive and deleted application identities", async () => {
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [companyId],
      sql: `UPDATE erp.users SET status='inactive' WHERE id='${userId}'::uuid;`,
    });
    const remoteClient = client();
    const provider = new SupabaseAuthenticationProvider(
      remoteClient,
      createSupabaseReadRepositories(remoteClient, createRemoteCore()).users,
    );
    await expect(provider.login({ username: email, password })).resolves.toMatchObject({
      success: false,
      error: { code: "REMOTE_USER_UNAVAILABLE" },
    });
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [companyId],
      sql: `
        DELETE FROM erp.user_roles WHERE user_id='${userId}'::uuid;
        DELETE FROM erp.users WHERE id='${userId}'::uuid;
      `,
    });
    const deleted = await harness!.admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
    userId = "";
    const rejected = await remoteClient.auth.signInWithPassword({ email, password });
    expect(rejected.error).toBeTruthy();
  }, 20_000);
});
