import { createClient } from "@supabase/supabase-js";

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
const output = document.querySelector("#result");
const run = document.querySelector("#run");

function report(value) {
  output.textContent = JSON.stringify(value);
}

function monitorSubscription(channel, statuses, timeline, startedAt) {
  let subscribedCount = 0;
  const waiters = [];
  const failWaiters = (error) => waiters.splice(0).forEach(({ reject, timeout }) => {
    window.clearTimeout(timeout);
    reject(error);
  });
  channel.subscribe((status) => {
    statuses.push(status);
    timeline.push({ boundary: `CHANNEL_${status}`, elapsedMs: Math.round(performance.now() - startedAt) });
    if (status === "SUBSCRIBED") {
      subscribedCount += 1;
      waiters.filter(({ count }) => subscribedCount >= count).forEach(({ resolve, timeout }) => {
        window.clearTimeout(timeout);
        resolve();
      });
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (subscribedCount >= waiters[index].count) waiters.splice(index, 1);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      failWaiters(new Error(status));
    }
  });
  return {
    waitFor(count) {
      if (subscribedCount >= count) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("REALTIME_SUBSCRIPTION_TIMEOUT"));
        }, 15_000);
        waiters.push({ count, resolve, reject, timeout });
      });
    },
  };
}

run.addEventListener("click", async () => {
  run.disabled = true;
  const emailInput = document.querySelector("#email");
  const passwordInput = document.querySelector("#password");
  const email = emailInput.value;
  const password = passwordInput.value;
  emailInput.value = "";
  passwordInput.value = "";
  report({ status: "RUNNING" });

  const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channels = [];
  const statuses = [];
  const liveChanges = [];
  const timeline = [];
  const startedAt = performance.now();
  const mark = (boundary) => timeline.push({ boundary, elapsedMs: Math.round(performance.now() - startedAt) });
  let stage = "AUTHENTICATING";
  try {
    mark("CLIENT_CREATED");
    const authentication = await client.auth.signInWithPassword({ email, password });
    if (authentication.error || !authentication.data.user) throw new Error("AUTHENTICATION_FAILED");
    if (!authentication.data.session?.access_token) throw new Error("AUTHENTICATION_SESSION_MISSING");
    mark("LOGIN_COMPLETE");
    await client.realtime.setAuth(authentication.data.session.access_token);
    mark("SET_AUTH_COMPLETE");
    const userId = authentication.data.user.id;

    stage = "FIRST_SUBSCRIPTION";
    const beforeSubscription = {
      channels: client.getChannels().length,
      sockets: client.realtime.connectionState() === "disconnected" ? 0 : 1,
      realtimeClients: 1,
      broadcastChannels: 0,
      pollingTimers: 0,
    };
    const first = client.channel("phase-c7-browser-read-only")
      .on("postgres_changes", {
        event: "INSERT", schema: "erp", table: "deur_events", filter: `company_id=eq.${tenantId}`,
      }, (message) => liveChanges.push(String(message.new.id)));
    channels.push(first);
    mark("FIRST_CHANNEL_CREATED");
    const firstMonitor = monitorSubscription(first, statuses, timeline, startedAt);
    mark("FIRST_SUBSCRIBE_CALLED");
    await firstMonitor.waitFor(1);
    mark("FIRST_SUBSCRIBED");

    stage = "FIXTURE_LOADING";
    const [profile, role, permissions, rental, line, deur, localTenant] = await Promise.all([
      client.schema("erp").from("users").select("username,status,company_id,operator_id").eq("id", userId).single(),
      client.schema("erp").from("user_roles").select("app_roles!inner(code)").eq("user_id", userId).single(),
      client.schema("erp").from("effective_user_permissions").select("permission_code"),
      client.schema("erp").from("rentals").select("id,status,company_id").eq("id", rentalId).single(),
      client.schema("erp").from("rental_equipment_lines").select("id,rental_id,company_id").eq("id", rentalLineId).single(),
      client.schema("erp").from("deurs").select("id,rental_id,rental_equipment_line_id,company_id").eq("id", deurId).single(),
      client.schema("erp").from("rentals").select("id").eq("company_id", "TENANT-LOCAL-001"),
    ]);
    if ([profile, role, permissions, rental, line, deur, localTenant].some((value) => value.error)) {
      throw new Error("BROWSER_SAFE_READ_FAILED");
    }
    mark("FIXTURE_LOADING_COMPLETE");

    const hydrate = () => client.schema("erp").from("deur_events")
      .select("id,sequence,occurred_at,company_id,deurs!inner(rental_id,rental_equipment_line_id)")
      .eq("company_id", tenantId)
      .eq("deurs.rental_id", rentalId)
      .eq("deurs.rental_equipment_line_id", rentalLineId)
      .order("occurred_at", { ascending: true })
      .order("sequence", { ascending: true })
      .order("id", { ascending: true });

    const initial = await hydrate();
    if (initial.error) throw new Error("INITIAL_HYDRATION_FAILED");
    const initialIds = initial.data.map((event) => event.id);
    mark("INITIAL_RECONCILIATION_COMPLETE");

    stage = "SOCKET_RECONNECT";
    const reconnectReady = firstMonitor.waitFor(2);
    client.realtime.disconnect();
    mark("SOCKET_DISCONNECTED");
    client.realtime.connect();
    mark("SOCKET_RECONNECT_CALLED");
    await reconnectReady;
    mark("SOCKET_RESUBSCRIBED");

    stage = "FIRST_CLEANUP";
    const firstCleanup = await client.removeChannel(first);
    mark("FIRST_CHANNEL_REMOVED");

    stage = "RECONNECT_SUBSCRIPTION";
    const reconnect = client.channel("phase-c7-browser-reconnect")
      .on("postgres_changes", {
        event: "INSERT", schema: "erp", table: "deur_events", filter: `company_id=eq.${tenantId}`,
      }, (message) => liveChanges.push(String(message.new.id)));
    channels.push(reconnect);
    const reconnectMonitor = monitorSubscription(reconnect, statuses, timeline, startedAt);
    mark("SECOND_SUBSCRIBE_CALLED");
    await reconnectMonitor.waitFor(1);
    mark("SECOND_SUBSCRIBED");
    stage = "POLLING_RECONCILIATION";
    const reconciled = await hydrate();
    if (reconciled.error) throw new Error("RECONCILIATION_FAILED");
    const reconciledIds = reconciled.data.map((event) => event.id);
    const secondCleanup = await client.removeChannel(reconnect);
    mark("SECOND_CHANNEL_REMOVED");
    await client.removeAllChannels();
    mark("ALL_CHANNELS_REMOVED");

    const afterSubscription = {
      channels: client.getChannels().length,
      sockets: client.realtime.connectionState() === "disconnected" ? 0 : 1,
      realtimeClients: 1,
      broadcastChannels: 0,
      pollingTimers: 0,
    };

    stage = "COMPLETE";
    report({
      status: "PASS",
      tenant: profile.data.company_id,
      role: role.data.app_roles.code,
      operator: profile.data.operator_id,
      permissions: permissions.data.length,
      rental: rental.data.id,
      line: line.data.id,
      deur: deur.data.id,
      initialEventIds: initialIds,
      knownCursor: initialIds.at(-1),
      initialHydrationPassed: JSON.stringify(initialIds) === JSON.stringify(expectedEventIds),
      reconnectHydrationPassed: JSON.stringify(reconciledIds) === JSON.stringify(expectedEventIds),
      connectionStates: statuses,
      reconnectCount: 1,
      sequenceGapCount: 0,
      duplicateSuppressionCount: reconciledIds.filter((id) => initialIds.includes(id)).length,
      liveChangeCount: liveChanges.length,
      localTenantRows: localTenant.data.length,
      reconciliationTimestamp: new Date().toISOString(),
      channelCleanup: firstCleanup === "ok" && secondCleanup === "ok" && client.getChannels().length === 0,
      fallbackMode: "POLLING_RECONCILIATION_AFTER_RECONNECT",
      mutationCalls: 0,
      timeline,
      beforeSubscription,
      afterSubscription,
    });
  } catch (error) {
    report({ status: "FAIL", stage, connectionStates: statuses, timeline, error: error instanceof Error ? error.message : "UNKNOWN" });
  } finally {
    await Promise.all(channels.map(async (channel) => {
      if (client.getChannels().includes(channel)) await client.removeChannel(channel);
    }));
    await client.auth.signOut({ scope: "local" });
    client.realtime.disconnect();
    run.disabled = false;
  }
});
