import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseOperationalRealtimeSource } from "@/integrations/supabase/SupabaseOperationalRealtimeSource";

describe("Phase C7 deterministic Supabase Realtime recovery", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes authentication and creates exactly one replacement after the bounded recovery window", async () => {
    vi.useFakeTimers();
    const callbacks: Array<(status: string, error?: Error) => void> = [];
    const channels = Array.from({ length: 2 }, (_, index) => ({
      id: index,
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => { callbacks.push(callback); return channels[index]; }),
    }));
    const client = {
      channel: vi.fn(() => channels[callbacks.length]),
      removeChannel: vi.fn(async () => "ok"),
      auth: { refreshSession: vi.fn(async () => ({ data: { session: { access_token: "safe-test-token" } }, error: null })) },
      realtime: { setAuth: vi.fn(async () => undefined), isDisconnecting: vi.fn(() => false) },
    } as unknown as SupabaseClient;
    const recovery: string[] = [];
    const source = new SupabaseOperationalRealtimeSource(client);
    const dispose = source.subscribe(
      { tenantId: "TENANT-UAT-C7", rentalId: "RENT-UAT-C7" },
      { event: vi.fn(), connected: vi.fn(), disconnected: vi.fn(), error: vi.fn(), recovery: (state) => recovery.push(state) },
    );

    callbacks[0]("SUBSCRIBED");
    callbacks[0]("CHANNEL_ERROR", new Error("bounded test interruption"));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(client.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledTimes(2);
    expect(recovery).toEqual(["DEGRADED", "AUTO_RECONNECTING", "RECREATING_CHANNEL"]);
    callbacks[1]("SUBSCRIBED");
    expect(recovery.at(-1)).toBe("RECOVERED");

    dispose();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("cancels pending recovery and never creates a replacement after disposal", async () => {
    vi.useFakeTimers();
    let callback: (status: string, error?: Error) => void = () => undefined;
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn((value) => { callback = value; return channel; }) };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
      auth: { refreshSession: vi.fn() },
      realtime: { setAuth: vi.fn(), isDisconnecting: vi.fn(() => false) },
    } as unknown as SupabaseClient;
    const source = new SupabaseOperationalRealtimeSource(client);
    const dispose = source.subscribe(
      { tenantId: "TENANT-UAT-C7" },
      { event: vi.fn(), connected: vi.fn(), disconnected: vi.fn(), error: vi.fn() },
    );
    callback("SUBSCRIBED");
    callback("CHANNEL_ERROR", new Error("test"));
    dispose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
    expect(client.channel).toHaveBeenCalledTimes(1);
  });
});
