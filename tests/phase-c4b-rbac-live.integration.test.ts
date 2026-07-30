import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C4B_LIVE === "true";
const tenantA = "TENANT-UAT-C4B-RBAC-A";
const tenantB = "TENANT-UAT-C4B-RBAC-B";
const password = `C4B-${randomBytes(24).toString("base64url")}`;

const actors = {
  administrator: { email: "tenant-uat-c4b-admin@example.invalid", role: "system-administrator" },
  operations: { email: "tenant-uat-c4b-operations@example.invalid", role: "rental-operations" },
  finance: { email: "tenant-uat-c4b-finance@example.invalid", role: "finance" },
  management: { email: "tenant-uat-c4b-management@example.invalid", role: "management" },
  ordinary: { email: "tenant-uat-c4b-ordinary@example.invalid", role: "ordinary" },
  operator: { email: "tenant-uat-c4b-operator@example.invalid", role: "rental-operations" },
} as const;

type ActorName = keyof typeof actors;
type CommandFamily = "rental" | "deur" | "billing" | "financialRecovery" | "rentalRecovery" | "review";
const commandFamilies: readonly CommandFamily[] = ["rental", "deur", "billing", "financialRecovery", "rentalRecovery", "review"];

const allowed: Record<ActorName, readonly CommandFamily[]> = {
  administrator: ["rental", "deur", "billing", "financialRecovery", "rentalRecovery", "review"],
  operations: ["rental", "deur", "rentalRecovery", "review"],
  finance: ["billing", "financialRecovery"],
  management: [],
  ordinary: [],
  operator: ["rental", "deur", "rentalRecovery", "review"],
};

describe.skipIf(!enabled)("Phase C4B real-session RBAC matrix", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  const userIds = new Map<ActorName, string>();
  const clients = new Map<ActorName, SupabaseClient>();

  function cleanupSql(): string {
    const ids = [...userIds.values()].map((id) => `'${id}'::uuid`).join(",");
    return `
      BEGIN;
      DELETE FROM erp.user_roles ${ids ? `WHERE user_id IN (${ids})` : "WHERE false"};
      DELETE FROM erp.users ${ids ? `WHERE id IN (${ids})` : "WHERE false"};
      DELETE FROM erp.role_permissions WHERE role_id LIKE 'ROLE-UAT-C4B-RBAC-%';
      DELETE FROM erp.app_roles WHERE id LIKE 'ROLE-UAT-C4B-RBAC-%';
      DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4B-RBAC-%';
      DELETE FROM erp.operators WHERE company_id IN ('${tenantA}','${tenantB}');
      DELETE FROM erp.customers WHERE company_id IN ('${tenantA}','${tenantB}');
      DELETE FROM erp.companies WHERE id IN ('${tenantA}','${tenantB}');
      COMMIT;
    `;
  }

  async function cleanup(): Promise<void> {
    executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenantA, tenantB], sql: cleanupSql() });
    for (const id of userIds.values()) await harness!.admin.auth.admin.deleteUser(id);
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenantA, tenantB]);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    await cleanup();
    for (const [name, actor] of Object.entries(actors) as [ActorName, (typeof actors)[ActorName]][]) {
      const created = await harness!.admin.auth.admin.createUser({ email: actor.email, password, email_confirm: true });
      if (created.error || !created.data.user) throw created.error ?? new Error("RBAC Auth user was not created.");
      userIds.set(name, created.data.user.id);
    }
    const userRows = ([...userIds] as [ActorName, string][]).map(([name, id]) =>
      `('${id}'::uuid,'${actors[name].email}','C4B ${name}','active',${name === "operator" ? "'UAT-C4B-RBAC-OPERATOR'" : "NULL"},'${tenantA}')`,
    ).join(",\n");
    const roleRows = Object.entries(actors).filter(([name]) => name !== "operator").map(([name, actor]) =>
      `('ROLE-UAT-C4B-RBAC-${name.toUpperCase()}','${actor.role}','C4B ${name}')`,
    ).join(",\n");
    const userRoleRows = ([...userIds] as [ActorName, string][]).map(([name, id]) =>
      `('${id}'::uuid,'ROLE-UAT-C4B-RBAC-${name === "operator" ? "OPERATIONS" : name.toUpperCase()}')`,
    ).join(",\n");
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [tenantA, tenantB],
      sql: `
        BEGIN;
        INSERT INTO erp.companies(id,code,name,environment_class) VALUES
        ('${tenantA}','${tenantA}','C4B RBAC A','test'),
        ('${tenantB}','${tenantB}','C4B RBAC B','test');
        INSERT INTO erp.operators(id,name,status,company_id)
        VALUES('UAT-C4B-RBAC-OPERATOR','C4B Operator','Active','${tenantA}');
        INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
        ('UAT-C4B-RBAC-CUSTOMER-A','UAT-C4B-RBAC-CUST-A','C4B Customer A','${tenantA}'),
        ('UAT-C4B-RBAC-CUSTOMER-B','UAT-C4B-RBAC-CUST-B','C4B Customer B','${tenantB}');
        INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES ${userRows};
        INSERT INTO erp.app_roles(id,code,name) VALUES ${roleRows};
        INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C4B-RBAC-RENTAL','rental.manage','Rental Manage'),
        ('PERM-UAT-C4B-RBAC-DEUR-CREATE','deur.create','DEUR Create'),
        ('PERM-UAT-C4B-RBAC-DEUR-REVIEW','deur.review','DEUR Review'),
        ('PERM-UAT-C4B-RBAC-BILLING-CREATE','billing.create','Billing Create'),
        ('PERM-UAT-C4B-RBAC-BILLING-UPDATE','billing.update','Billing Update');
        INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT role.id, permission.id
        FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
        WHERE role.id='ROLE-UAT-C4B-RBAC-ADMINISTRATOR'
          AND permission.id LIKE 'PERM-UAT-C4B-RBAC-%';
        INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT role.id, permission.id
        FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
        WHERE role.id='ROLE-UAT-C4B-RBAC-OPERATIONS'
          AND permission.id IN ('PERM-UAT-C4B-RBAC-RENTAL','PERM-UAT-C4B-RBAC-DEUR-CREATE','PERM-UAT-C4B-RBAC-DEUR-REVIEW');
        INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT role.id, permission.id
        FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
        WHERE role.id='ROLE-UAT-C4B-RBAC-FINANCE'
          AND permission.id IN ('PERM-UAT-C4B-RBAC-BILLING-CREATE','PERM-UAT-C4B-RBAC-BILLING-UPDATE');
        INSERT INTO erp.user_roles(user_id,role_id) VALUES ${userRoleRows};
        COMMIT;
      `,
    });
    for (const [name, actor] of Object.entries(actors) as [ActorName, (typeof actors)[ActorName]][]) {
      const client = createClient(configuration.url!, configuration.publishableKey!, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: `c4b-rbac-${name}` },
      });
      const signedIn = await client.auth.signInWithPassword({ email: actor.email, password });
      if (signedIn.error) throw signedIn.error;
      clients.set(name, client);
    }
  }, 40_000);

  afterAll(async () => {
    for (const client of clients.values()) await client.auth.signOut();
    await cleanup();
    await cleanup();
  }, 30_000);

  async function command(client: SupabaseClient, family: CommandFamily) {
    const definitions = {
      rental: ["command_create_reserved_rental", { commandId: "C4B-RBAC-RENTAL", idempotencyKey: "C4B-RBAC-RENTAL" }],
      deur: ["command_start_deur_shift", { commandId: "C4B-RBAC-DEUR", idempotencyKey: "C4B-RBAC-DEUR" }],
      billing: ["command_create_billing_statement", { commandId: "C4B-RBAC-BILLING", idempotencyKey: "C4B-RBAC-BILLING" }],
      financialRecovery: ["command_void_billing_statement", { commandId: "C4B-RBAC-FINANCE-RECOVERY", idempotencyKey: "C4B-RBAC-FINANCE-RECOVERY", reason: "C4B valid recovery reason" }],
      rentalRecovery: ["command_reopen_rental", { commandId: "C4B-RBAC-RENTAL-RECOVERY", idempotencyKey: "C4B-RBAC-RENTAL-RECOVERY", reason: "C4B valid recovery reason" }],
      review: ["command_create_customer_review_request", { commandId: "C4B-RBAC-REVIEW", idempotencyKey: "C4B-RBAC-REVIEW" }],
    } as const;
    const [rpc, payload] = definitions[family];
    const result = await client.schema("erp").rpc(rpc, { command: payload });
    if (result.error) throw result.error;
    return result.data as { success: boolean; code?: string };
  }

  for (const name of Object.keys(actors) as ActorName[]) {
    it(`${name} matches the frozen command-family expectations`, async () => {
      const client = clients.get(name)!;
      for (const family of commandFamilies) {
        const result = await command(client, family);
        if (allowed[name].includes(family)) {
          expect(result.code, `${name}/${family}`).not.toBe("FORBIDDEN");
          expect(result.code, `${name}/${family}`).not.toBe("UNAUTHENTICATED");
        } else {
          expect(result, `${name}/${family}`).toMatchObject({ success: false, code: "FORBIDDEN" });
        }
      }
    });
  }

  it("keeps catalog reads available and tenant reads concealed across companies", async () => {
    for (const client of clients.values()) {
      const catalog = await client.schema("erp").from("app_permissions").select("code").limit(1);
      expect(catalog.error).toBeNull();
      const own = await client.schema("erp").from("customers").select("id").eq("id", "UAT-C4B-RBAC-CUSTOMER-A");
      const cross = await client.schema("erp").from("customers").select("id").eq("id", "UAT-C4B-RBAC-CUSTOMER-B");
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(cross.error).toBeNull();
      expect(cross.data).toHaveLength(0);
    }
  });

  it("denies anonymous execution of every authenticated command family", async () => {
    const anonymous = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c4b-rbac-anon" },
    });
    for (const family of commandFamilies) {
      const definitions: Record<CommandFamily, string> = {
        rental: "command_create_reserved_rental",
        deur: "command_start_deur_shift",
        billing: "command_create_billing_statement",
        financialRecovery: "command_void_billing_statement",
        rentalRecovery: "command_reopen_rental",
        review: "command_create_customer_review_request",
      };
      const result = await anonymous.schema("erp").rpc(definitions[family], { command: {} });
      expect(result.error?.code, family).toBe("42501");
    }
  });
});
