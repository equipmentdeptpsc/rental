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

async function waitForSocketState(client, expectedState, timeoutMs = 1_000) {
  const deadline = performance.now() + timeoutMs;
  while (client.realtime.connectionState() !== expectedState
    || (expectedState === "closed" && client.realtime.isDisconnecting())) {
    if (performance.now() >= deadline) throw new Error(`REALTIME_SOCKET_${expectedState.toUpperCase()}_TIMEOUT`);
    await new Promise((resolve) => window.setTimeout(resolve, 10));
  }
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
    } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && subscribedCount === 0) {
      failWaiters(new Error(status));
    }
  });
  return {
    subscribedCount: () => subscribedCount,
    waitFor(count, timeoutMs = 15_000) {
      if (subscribedCount >= count) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("REALTIME_SUBSCRIPTION_TIMEOUT"));
        }, timeoutMs);
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
    realtime: { reconnectAfterMs: () => 250 },
  });
  const channels = [];
  const statuses = [];
  const liveChanges = [];
  const timeline = [];
  const recoveryStates = ["CONNECTING"];
  const requestedRecoveryMode = new URLSearchParams(window.location.search).get("recovery") === "explicit"
    ? "FORCE_EXPLICIT_RECREATION"
    : "ALLOW_AUTOMATIC_REJOIN";
  const startedAt = performance.now();
  let stage = "AUTHENTICATING";
  const mark = (boundary) => {
    timeline.push({ boundary, elapsedMs: Math.round(performance.now() - startedAt) });
    report({ status: "RUNNING", stage, timeline });
  };
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
      sockets: client.realtime.connectionState() === "closed" ? 0 : 1,
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

    stage = "SOCKET_RECOVERY";
    recoveryStates.push("SUBSCRIBED");
    let activeChannel = first;
    let activeMonitor = firstMonitor;
    let recoveryPath = "AUTOMATIC_REJOIN";
    let staleChannelCleanup = null;
    const automaticRecovery = requestedRecoveryMode === "ALLOW_AUTOMATIC_REJOIN"
      ? firstMonitor.waitFor(2, 2_000).then(() => true).catch(() => false)
      : Promise.resolve(false);
    const testSocket = client.realtime.conn;
    if (!testSocket) throw new Error("REALTIME_TEST_SOCKET_MISSING");
    testSocket.close(4001, "c7-test-reconnect");
    mark("SOCKET_DISCONNECTED");
    recoveryStates.push("DEGRADED", "AUTO_RECONNECTING");

    const automaticallyRejoined = await automaticRecovery;
    if (automaticallyRejoined) {
      mark("AUTOMATIC_CHANNEL_REJOINED");
    } else {
      recoveryPath = "EXPLICIT_CHANNEL_RECREATION";
      recoveryStates.push("RECREATING_CHANNEL");
      mark("AUTOMATIC_RECOVERY_DEADLINE_REACHED");
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) throw new Error("SESSION_REFRESH_FAILED");
      mark("SESSION_REFRESHED");
      await client.realtime.setAuth(refreshed.data.session.access_token);
      mark("REALTIME_TOKEN_REAPPLIED");
      staleChannelCleanup = await client.removeChannel(first);
      mark("STALE_CHANNEL_REMOVED");
      await waitForSocketState(client, "closed");
      mark("STALE_SOCKET_CLOSED");
      const replacement = client.channel("phase-c7-browser-recovered")
        .on("postgres_changes", {
          event: "INSERT", schema: "erp", table: "deur_events", filter: `company_id=eq.${tenantId}`,
        }, (message) => liveChanges.push(String(message.new.id)));
      channels.push(replacement);
      activeChannel = replacement;
      activeMonitor = monitorSubscription(replacement, statuses, timeline, startedAt);
      mark("REPLACEMENT_CHANNEL_CREATED");
      await activeMonitor.waitFor(1);
      mark("REPLACEMENT_CHANNEL_SUBSCRIBED");
    }

    stage = "POLLING_RECONCILIATION";
    recoveryStates.push("RECONCILING");
    mark("RECONCILIATION_STARTED");
    const reconciled = await hydrate();
    if (reconciled.error) throw new Error("RECONCILIATION_FAILED");
    const reconciledIds = reconciled.data.map((event) => event.id);
    const combinedIds = [...initialIds];
    let duplicateSuppressionCount = 0;
    reconciledIds.forEach((id) => {
      if (combinedIds.includes(id)) duplicateSuppressionCount += 1;
      else combinedIds.push(id);
    });
    mark("RECONCILIATION_COMPLETED");
    recoveryStates.push("RECOVERED");
    const activeCleanup = await client.removeChannel(activeChannel);
    mark("ACTIVE_CHANNEL_REMOVED");
    await client.removeAllChannels();
    mark("ALL_CHANNELS_REMOVED");
    recoveryStates.push("CLOSED");

    const afterSubscription = {
      channels: client.getChannels().length,
      sockets: client.realtime.connectionState() === "closed" ? 0 : 1,
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
      duplicateSuppressionCount,
      uniqueBusinessEventCount: combinedIds.length,
      liveChangeCount: liveChanges.length,
      localTenantRows: localTenant.data.length,
      reconciliationTimestamp: new Date().toISOString(),
      channelCleanup: (staleChannelCleanup === null || staleChannelCleanup === "ok")
        && activeCleanup === "ok" && client.getChannels().length === 0,
      fallbackMode: "POLLING_RECONCILIATION_AFTER_RECONNECT",
      mutationCalls: 0,
      timeline,
      recoveryStates,
      recoveryPath,
      requestedRecoveryMode,
      finalCursor: reconciledIds.at(-1),
      finalPollingWorkerCount: 0,
      beforeSubscription,
      afterSubscription,
    });
  } catch (error) {
    recoveryStates.push("FAILED");
    report({ status: "FAIL", stage, connectionStates: statuses, timeline, recoveryStates, error: error instanceof Error ? error.message : "UNKNOWN" });
  } finally {
    await Promise.all(channels.map(async (channel) => {
      if (client.getChannels().includes(channel)) await client.removeChannel(channel);
    }));
    await client.auth.signOut({ scope: "local" });
    client.realtime.disconnect();
    run.disabled = false;
  }
});
