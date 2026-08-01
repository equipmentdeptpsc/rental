// @vitest-environment node
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  assertSafeSupabaseTestConfiguration,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";

const configuration = readSupabasePhaseC2TestConfiguration();
const tenantId = "TENANT-UAT-C7-001";
const rentalId = "RENT-UAT-C7-001";
const rentalLineId = "LINE-UAT-C7-001";
const deurId = "DEUR-UAT-C7-001";
const expectedEventIds = [
  "EVENT-UAT-C7-001",
  "EVENT-UAT-C7-002",
  "EVENT-UAT-C7-003",
  "EVENT-UAT-C7-004",
];

async function subscribe(channel: RealtimeChannel, statuses: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("REALTIME_SUBSCRIPTION_TIMEOUT")), 15_000);
    channel.subscribe((status) => {
      statuses.push(status);
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(status));
      }
    });
  });
}

describe.skipIf(!configuration.enabled)("Phase C7 isolated Supabase Realtime read-only validation", () => {
  it("authenticates, hydrates, reconnects, reconciles, and cleans up without mutation", async () => {
    assertSafeSupabaseTestConfiguration(configuration);
    const email = process.env.C7_UAT_LOGIN;
    const password = process.env.C7_UAT_PASSWORD;
    expect(email, "C7_UAT_LOGIN is required for the opt-in live test").toBeTruthy();
    expect(password, "C7_UAT_PASSWORD is required for the opt-in live test").toBeTruthy();

    const client = createClient(configuration.url, configuration.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const channels: RealtimeChannel[] = [];
    try {
      const authenticated = await client.auth.signInWithPassword({ email: email!, password: password! });
      expect(authenticated.error).toBeNull();
      expect(authenticated.data.user).not.toBeNull();

      const profile = await client.schema("erp").from("users")
        .select("id,username,status,company_id,operator_id")
        .eq("id", authenticated.data.user!.id)
        .single();
      expect(profile.error).toBeNull();
      expect(profile.data).toMatchObject({
        username: "USER-UAT-C7-001",
        status: "active",
        company_id: tenantId,
        operator_id: "OPR-UAT-C7-001",
      });

      const assignedRole = await client.schema("erp").from("user_roles")
        .select("app_roles!inner(code)")
        .eq("user_id", authenticated.data.user!.id)
        .single();
      expect(assignedRole.error).toBeNull();
      expect(assignedRole.data).toMatchObject({ app_roles: { code: "rental-operations" } });

      const permissionRows = await client.schema("erp").from("effective_user_permissions")
        .select("permission_code");
      expect(permissionRows.error).toBeNull();
      expect(permissionRows.data).toHaveLength(31);

      const rental = await client.schema("erp").from("rentals").select("id,status,company_id")
        .eq("id", rentalId).single();
      const line = await client.schema("erp").from("rental_equipment_lines")
        .select("id,rental_id,equipment_id,operator_id,company_id")
        .eq("id", rentalLineId).single();
      const deur = await client.schema("erp").from("deurs")
        .select("id,rental_id,rental_equipment_line_id,equipment_id,operator_id,company_id,row_version")
        .eq("id", deurId).single();
      expect(rental.error).toBeNull();
      expect(rental.data).toMatchObject({ id: rentalId, status: "Active", company_id: tenantId });
      expect(line.error).toBeNull();
      expect(line.data).toMatchObject({ id: rentalLineId, rental_id: rentalId, company_id: tenantId });
      expect(deur.error).toBeNull();
      expect(deur.data).toMatchObject({ id: deurId, rental_id: rentalId, rental_equipment_line_id: rentalLineId, company_id: tenantId });

      const hydrate = async () => client.schema("erp").from("deur_events")
        .select("id,sequence,occurred_at,company_id,deurs!inner(rental_id,rental_equipment_line_id)")
        .eq("company_id", tenantId)
        .eq("deurs.rental_id", rentalId)
        .eq("deurs.rental_equipment_line_id", rentalLineId)
        .order("occurred_at", { ascending: true })
        .order("sequence", { ascending: true })
        .order("id", { ascending: true });

      const initial = await hydrate();
      expect(initial.error).toBeNull();
      expect(initial.data?.map((event) => event.id)).toEqual(expectedEventIds);
      expect(new Set(initial.data?.map((event) => event.id)).size).toBe(4);
      expect(initial.data?.at(-1)?.id).toBe("EVENT-UAT-C7-004");

      const localTenantRows = await client.schema("erp").from("rentals")
        .select("id").eq("company_id", "TENANT-LOCAL-001");
      const wrongRentalRows = await client.schema("erp").from("deurs")
        .select("id").eq("rental_id", "RENT-UAT-C7-NOT-ALLOWED");
      const wrongLineRows = await client.schema("erp").from("deurs")
        .select("id").eq("rental_equipment_line_id", "LINE-UAT-C7-NOT-ALLOWED");
      expect(localTenantRows.error).toBeNull();
      expect(localTenantRows.data).toEqual([]);
      expect(wrongRentalRows.data).toEqual([]);
      expect(wrongLineRows.data).toEqual([]);

      const statuses: string[] = [];
      const receivedLiveChanges: string[] = [];
      const first = client.channel("phase-c7-read-only-certification")
        .on("postgres_changes", {
          event: "INSERT", schema: "erp", table: "deur_events", filter: `company_id=eq.${tenantId}`,
        }, (message) => receivedLiveChanges.push(String(message.new.id)));
      channels.push(first);
      await subscribe(first, statuses);
      expect(statuses).toContain("SUBSCRIBED");
      expect(receivedLiveChanges).toEqual([]);
      expect(await client.removeChannel(first)).toBe("ok");

      const reconnectStatuses: string[] = [];
      const reconnect = client.channel("phase-c7-read-only-reconnect")
        .on("postgres_changes", {
          event: "INSERT", schema: "erp", table: "deur_events", filter: `company_id=eq.${tenantId}`,
        }, (message) => receivedLiveChanges.push(String(message.new.id)));
      channels.push(reconnect);
      await subscribe(reconnect, reconnectStatuses);
      expect(reconnectStatuses).toContain("SUBSCRIBED");

      const reconciled = await hydrate();
      expect(reconciled.error).toBeNull();
      expect(reconciled.data?.map((event) => event.id)).toEqual(expectedEventIds);
      expect(new Set(reconciled.data?.map((event) => event.id)).size).toBe(4);
      expect(receivedLiveChanges).toEqual([]);
      expect(await client.removeChannel(reconnect)).toBe("ok");
      await client.removeAllChannels();
      expect(client.getChannels()).toHaveLength(0);
    } finally {
      await Promise.all(channels.map(async (channel) => {
        if (client.getChannels().includes(channel)) await client.removeChannel(channel);
      }));
      await client.auth.signOut({ scope: "local" });
    }
  }, 45_000);
});
